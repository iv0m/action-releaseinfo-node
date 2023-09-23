import core from '@actions/core';
import github from '@actions/github';

const octokit = github.getOctokit('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');

/**
 * Retrieve all the existing labels in the repository
 *
 * @param {string} repoOwner
 * @param {string} repository
 * @param {number} limit
 * @returns {array} - The list of labels as an array
 */
async function getLabels(repoOwner, repository, limit = 100) {
    const query = `
        query getLabels($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
                labels(first: $limit) {
                  nodes {
                    name
                  }
                }
              }
        }
    `;

    const existingLabels = await octokit.graphql(query, {
        owner: repoOwner,
        repo: repository,
        limit: limit,
    });

    return existingLabels?.repository?.labels?.nodes ?? [];
}

async function main() {
    try {
        const myToken = core.getInput('my_token');
        const targetRepo = core.getInput('repository') || 'gh-action-test';
        const targetOwner = core.getInput('owner') || 'iv0m';

        let query = `
        query lastRelease {
            repository(owner: "${targetOwner}", name: "${targetRepo}") {
                releases(last: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
                    nodes {
                        publishedAt
                        tagName
                    }
                }
            }
        }`;

        const resultRelease = await octokit.graphql(query);
        const lastReleaseDate = resultRelease?.releases?.nodes[0]?.publishedAt;
        const lastReleaseTag = resultRelease?.releases?.nodes[0]?.tagName;
        let filterLastReleaseDate = '';

        if (lastReleaseDate) {
            console.log(`Retrieving all merged PRs since last release "${lastReleaseTag}"`);
            filterLastReleaseDate = ', ' + lastReleaseDate;
        } else console.log('No past release was found. Retrieving ALL merged PRs...');

        query = `
        {
            repository(owner: "${targetOwner}", name: "${targetRepo}") {
                pullRequests(first: 100, states: [MERGED], orderBy: {field: CREATED_AT, direction: ASC ${filterLastReleaseDate}}) {
                nodes {
                    id
                    title
                    mergedAt
                    number
                    labels(first: 10) {
                        nodes {
                            name
                        }
                    }
                    author {
                        login
                    }
                    mergeCommit {
                        oid
                    }
                  }
                }
            }
        }`;

        const resultMergedPrs = await octokit.graphql(query);
        //console.log(resultMergedPrs?.repository?.pullRequests?.nodes);

        const prs = resultMergedPrs.repository.pullRequests.nodes;
        const groupedByLabels = {
            nolabel: [],
        };

        const mutationAddPrComment = `
        mutation AddPRComment($pullRequestId: ID!, $body: String!) {
            addComment(input: {subjectId: $pullRequestId, body: $body}) {
                commentEdge {
                    node {
                        id
                    }
                }
            }
        }`;

        const mutationVars = {
            pullRequestId: null,
            body: '*This PR has been included in the release changelog - automated action.*',
        };

        prs.forEach(async (pr) => {
            if (pr.labels.nodes.length === 0) groupedByLabels['nolabel'].push(pr);
            else
                pr.labels.nodes.forEach((label) => {
                    if (!groupedByLabels[label.name]) groupedByLabels[label.name] = [];

                    groupedByLabels[label.name].push(pr);
                });

            mutationVars.pullRequestId = pr.id;

            await octokit.graphql(mutationAddPrComment, mutationVars);
        });

        console.log(groupedByLabels);

        // output the current time
        const time = new Date().toTimeString();
        core.setOutput('time', time);
    } catch (error) {
        core.setFailed(error.message);
    }
}

main();
