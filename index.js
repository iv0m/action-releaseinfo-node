import core from '@actions/core';
import github from '@actions/github';

async function main() {
    try {
        const myToken = core.getInput('myToken');
        const targetRepo = core.getInput('repository');
        const targetOwner = core.getInput('owner');
        const octokit = github.getOctokit(myToken);

        const query = `
        query lastRelease {
            repository(owner: "${targetOwner}", name: "${targetRepo}") {
                releases(last: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
                    nodes {
                        createdAt
                        tagName
                    }
                }
            }
        }`;

        const results = await octokit.graphql(query);
        console.log(results);
        console.log(results.repository.releases.nodes.createdAt);

        // output the current time
        const time = new Date().toTimeString();
        core.setOutput('time', time);
    } catch (error) {
        core.setFailed(error.message);
    }
}

main();
