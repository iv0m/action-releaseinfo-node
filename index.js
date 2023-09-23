import core from '@actions/core';
import github from '@actions/github';

// This constant is used by this action to `mark` the pull requests as `processed`
const LABEL_INTERNAL = '#action_internal#';

/**
 * Retrieves existing labels from the repository
 *
 * @param {object} octokit
 * @param {string} repoOwner
 * @param {string} repository
 * @param {number} limit
 * @returns {array} - The list of labels as an array
 */
async function getLabels(octokit, repoOwner, repository, limit = 100) {
  const query = `
    query getLabels($owner: String!, $repo: String!, $limit: Int) {
      repository(owner: $owner, name: $repo) {
        labels(first: $limit) {
          nodes {
            name
          }
        }
      }
    }`;

  const existingLabels = await octokit.graphql(query, {
    owner: repoOwner,
    repo: repository,
    limit: limit,
  });

  return existingLabels?.repository?.labels?.nodes?.map((o) => o.name) ?? [];
}

/**
 * Retrieves the `lastReleaseDate` and the `lastReleaseTag` properties of the last release
 *
 * @param {object} octokit
 * @param {string} repoOwner
 * @param {string} repository
 * @returns {object} - Object that contains the `lastReleaseDate` and the `lastReleaseTag` of the last release
 */
async function getLastRelease(octokit, repoOwner, repository) {
  const query = `
    query lastRelease($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        releases(last: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
            nodes {
              publishedAt
              tagName
            }
          }
        }
    }`;

  const releaseInfo = await octokit.graphql(query, {
    owner: repoOwner,
    repo: repository,
  });

  return {
    lastReleaseDate: releaseInfo?.releases?.nodes[0]?.publishedAt ?? undefined,
    lastReleaseTag: releaseInfo?.releases?.nodes[0]?.tagName ?? undefined,
  };
}

/**
 * Retrieves the last N pull requests since the specified date
 *
 * @param {object} octokit
 * @param {string} repoOwner
 * @param {string} repository
 * @param {object} searchOptions
 * @param {number} limit
 * @returns {array} - Array of pull requests objects
 */
async function getLastPullRequests(octokit, repoOwner, repository, searchOptions, label, limit = 30) {
  let filterLastReleaseDate = '';

  if (searchOptions && typeof searchOptions === 'object' && searchOptions.lastReleaseDate) {
    console.log(`Retrieving all unprocessed and merged PRs since last release "${searchOptions.lastReleaseTag}"`);
    filterLastReleaseDate = `, after: "${searchOptions.lastReleaseDate}"`;
  } else console.log('No past release was found. Retrieving ALL merged PRs...');

  const query = `
    query getLastPullRequests($owner: String!, $repo: String!, $limit: Int) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: $limit, states: [MERGED], orderBy: {field: CREATED_AT, direction: ASC ${filterLastReleaseDate}}) {
          nodes {
            id
            title
            number
            labels(first: 10) {
              nodes {
                name
              }
            }
            author {
              login
            }
          }
        }
      }
    }`;

  const resultMergedPrs = await octokit.graphql(query, {
    owner: repoOwner,
    repo: repository,
    lastReleaseDate: searchOptions.lastReleaseDate,
    limit: limit,
  });

  // Filter PRs to only those that do not have the specified label
  return (
    resultMergedPrs?.repository?.pullRequests?.nodes?.filter((pr) => {
      return !pr.labels?.nodes?.some((lbl) => lbl.name === label);
    }) ?? []
  );
}

/**
 * Adds a comment to a specific pull request
 *
 * @param {object} octokit
 * @param {number} prId
 * @param {string} textContent
 * @returns {object} - An object that contains the `id` property of the updated pull request
 */
async function addCommentToPr(octokit, prId, textContent = undefined) {
  const text = textContent || '*This pull request has been included in the release changelog by the automated action.*';

  const mutation = `
    mutation addPrComment($pullRequestId: ID!, $body: String!) {
      addComment(input: {subjectId: $pullRequestId, body: $body}) {
        commentEdge {
          node {
            id
          }
        }
      }
    }`;

  return await octokit.graphql(mutation, {
    pullRequestId: prId,
    body: text,
  });
}

/**
 * Main function
 */
async function main() {
  try {
    const myToken = core.getInput('my_token') || '';
    const targetRepo = core.getInput('repository') || 'gh-action-test';
    const targetOwner = core.getInput('owner') || 'iv0m';
    const octokit = github.getOctokit(myToken);

    const existingLabels = await getLabels(octokit, targetOwner, targetRepo);

    if (!(existingLabels.findIndex((label) => label === LABEL_INTERNAL) > -1)) {
      console.log(`Label "${LABEL_INTERNAL}" not found, creating label...`);
      // TODO: create label
    }

    const { lastReleaseDate, lastReleaseTag } = await getLastRelease(octokit, targetOwner, targetRepo);

    const searchOptions = {
      lastReleaseDate,
      lastReleaseTag,
    };

    const prs = await getLastPullRequests(octokit, targetOwner, targetRepo, searchOptions, LABEL_INTERNAL);

    const groupedByLabels = {
      nolabel: [],
    };

    prs.forEach(async (pr) => {
      if (pr.labels.nodes.length === 0) groupedByLabels['nolabel'].push(pr);
      else
        pr.labels.nodes.forEach((label) => {
          if (!groupedByLabels[label.name]) groupedByLabels[label.name] = [];

          groupedByLabels[label.name].push(pr);
        });

      await addCommentToPr(octokit, pr.id);
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
