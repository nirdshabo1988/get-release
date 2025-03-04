import * as core from "@actions/core";
import { getOctokit } from "@actions/github";
import {
  getInputs,
  isBlank,
  isNotBlank,
  ReleaseInputs,
  setOutputs,
} from "./io-helper";

export function isSuccessStatusCode(statusCode?: number): boolean {
  if (!statusCode) return false;
  return statusCode >= 200 && statusCode < 300;
}

export function findLatestRelease(releases: any[]): any {
  let result: any,
    latest: number = 0;

  // Find the latest release by `published_at`
  releases.forEach((release) => {
    const tagNames = release.tag_name.split("-");
    const versionNumber = 1 * tagNames[tagNames.length - 1];
    const publishedDate: number = versionNumber;
    if (result == null || latest < publishedDate) {
      result = release;
      result.version = versionNumber;
      result.next_version = versionNumber + 1;
      result.Version = versionNumber;
      latest = publishedDate;
    }
  });

  return result;
}
async function getReleases(page: number,per_page=100){
    const inputs: ReleaseInputs = getInputs();
    const github = getOctokit(process.env.GITHUB_TOKEN as string);

    const listResponse = await github.rest.repos.listReleases(
        {
          owner: inputs.owner,
          repo: inputs.repo,
          page: page,
          per_page: per_page,
        }
      );

    if (isSuccessStatusCode(listResponse.status)) {
        const releaseList = listResponse.data.filter(
          (release) =>
            !release.draft &&
            (!release.prerelease || inputs.prerelease) &&
            (!inputs.pattern || inputs.pattern.test(release.tag_name))
        );

        const latestRelease: any = findLatestRelease(releaseList);
        if (isNotBlank(latestRelease)) setOutputs(latestRelease, inputs.debug);
        else {
            getReleases(page+1,per_page);
        }

}
}
export function handlerError(message: string, throwing: boolean) {
  if (throwing) throw new Error(message);
  else core.warning(message);
}

(async function run() {
  try {
    const inputs: ReleaseInputs = getInputs();
    const github = getOctokit(process.env.GITHUB_TOKEN as string);

    core.info(
      `Start get release with:\n  owner: ${inputs.owner}\n  repo: ${inputs.repo}`
    );

    if (!inputs.latest) {
      if (isBlank(inputs.tag))
        handlerError("Current release not found", inputs.throwing);
      else {
        try {
          // Get a release from the tag name
          const releaseResponse = await github.rest.repos.getReleaseByTag({
            owner: inputs.owner,
            repo: inputs.repo,
            tag: inputs.tag,
          });
          if (isSuccessStatusCode(releaseResponse.status))
            setOutputs(
              {
                version: inputs.version,
                next_version: inputs.next_version,
                ...releaseResponse.data,
              },
              inputs.debug
            );
          else
            throw new Error(
              `Unexpected http ${releaseResponse.status} during get release`
            );
        } catch (e: any) {
          if (e.status === 404)
            handlerError(
              `No release has been found with ${inputs.tag} tag`,
              inputs.throwing
            );
          else handlerError(e.message, inputs.throwing);
        }
      }
    } else {

        const latestRelease: any = await getReleases(1,100);
        if (isNotBlank(latestRelease)) return;
        else {
          if (!!inputs.pattern){
            handlerError(
              `No release had a tag name matching /${inputs.pattern.source}/`,
              inputs.throwing
            );
          }
          else
            handlerError("The latest release was not found", inputs.throwing);
        }

    }

    core.info("Get release has finished successfully");
  } catch (err: any) {
    core.setFailed(err.message);
  }
})();
