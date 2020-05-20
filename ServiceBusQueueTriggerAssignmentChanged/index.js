const { Octokit } = require("@octokit/rest");
const azdev = require(`azure-devops-node-api`);
const fetch = require('node-fetch');
const jp = require('jsonpath');
const util = require('util');

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

module.exports = async function(context, mySbMsg) {

    // Get actual work item as the input message doesn't have the user descriptor to make queries
    var workItem = await getWorkItem(mySbMsg.resource.workItemId);

    var id = mySbMsg.resource.workItemId;
    var title = workItem.fields['System.Title'];
    var assignedTo = workItem.fields['System.AssignedTo'];

    var githubId = title.match(/(?:\(GitHub Issue #)(\d+)\)$/)[1];
    var githubIssue = await getGitHubIssue(githubId);
    context.log("githubIssue.data.assignee = " + githubIssue.data.assignee);
    var assignee = githubIssue.data.assignee;

    if (assignedTo != undefined) {
        // A user assignment is made

        // Get originId of user
        var originId = await fetch(util.format("https://vssps.dev.azure.com/%s/_apis/Graph/Users/%s", process.env.ADO_ORGANIZATION,assignedTo.descriptor), {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(':' + process.env.ADO_TOKEN).toString('base64'),
            },
        })
        .then(res => res.json())
        .then(json => json.originId);

        context.log("originId = " + originId);

        // Have originId, get GitHub user.
        var githubUser = await fetch(util.format(process.env.ID_MAPPING_URL, originId), {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(':' + process.env.ID_MAPPING_TOKEN).toString('base64'),
            },
        })
        .then(res => res.json())
        .then(json => jp.value(json, process.env.ID_MAPPING_QUERY));

        context.log("githubUser = " + githubUser);

		if (githubUser == undefined) {
			context.log("User mapping for " + assignedTo.uniqueName + " not found.");
        } 
        else {
            // Have GitHub user.

            if ( assignee == null || assignee != githubUser) {
                octokit.issues.update({
                    owner: process.env.GITHUB_USER,
                    repo: process.env.GITHUB_REPO,
                    issue_number: githubId,
                    assignees: [
                        githubUser
                    ]
                });

                octokit.issues.createComment({
                    owner: process.env.GITHUB_USER,
                    repo: process.env.GITHUB_REPO,
                    issue_number: githubId,
                    body: 'AB#' + id + ' assigned to ' + assignedTo.displayName + '.'
                });
            }
        } 
    } 
    // Issue is unassigned, but only update if GitHub issue is not already unassigned
    else if (assignee != null) {
        octokit.issues.update({
            owner: process.env.GITHUB_USER,
            repo: process.env.GITHUB_REPO,
            issue_number: githubId,
            assignees: []
        });

        octokit.issues.createComment({
            owner: process.env.GITHUB_USER,
            repo: process.env.GITHUB_REPO,
            issue_number: githubId,
            body: 'AB#' + id + ' unassigned' + '.'
        });
    }
};

async function getWorkItem(id) {

    if (id != undefined) {
        let authHandler = azdev.getPersonalAccessTokenHandler(process.env.ADO_TOKEN);
        let connection = new azdev.WebApi("https://dev.azure.com/" + process.env.ADO_ORGANIZATION, authHandler);
        let client = await connection.getWorkItemTrackingApi();
        var workItem = await client.getWorkItem(id, null, null, 4);

        return workItem;
    }
    else {
        return null;
    }
}

async function getGitHubIssue(id) {

    // Gets the GitHub issue ID, which is the %d in "(GitHub Issue #%d)"

    if(id != undefined) {
        var result = await octokit.issues.get({
            owner: process.env.GITHUB_USER,
            repo: process.env.GITHUB_REPO,
            issue_number: id,
        });

        return result;
    } 
    else {
        return null;
    }
}

