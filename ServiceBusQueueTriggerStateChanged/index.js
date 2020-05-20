const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

module.exports = async function(context, mySbMsg) {

    var id = mySbMsg.resource.workItemId;
    var title = mySbMsg.resource.revision.fields['System.Title'];
    var newState = mySbMsg.resource.fields['System.State'].newValue;

    // Gets the GitHub issue ID, which is the %d in "(GitHub Issue #%d)"
    var issueId = title.match(/(?:\(GitHub Issue #)(\d+)\)$/)[1];

    if(issueId != undefined && newState == 'Done') {
        //context.log(issueId);
        var { data } = await octokit.issues.get({
            owner: process.env.GITHUB_USER,
            repo: process.env.GITHUB_REPO,
            issue_number: issueId,
        });
  
        // context.log(data);
        if ( data.state == "open") {
            context.log("Issue is open");
    
    
            octokit.issues.update({
                owner: process.env.GITHUB_USER,
                repo: process.env.GITHUB_REPO,
                issue_number: issueId,
                state: "closed"
            });

            octokit.issues.createComment({
                owner: process.env.GITHUB_USER,
                repo: process.env.GITHUB_REPO,
                issue_number: issueId,
                body: 'AB#' + id + ' closed.'
            });
        }
    }
};