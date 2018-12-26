const childProcess = require('child_process');
const findUp = require('find-up');
const fs = require('fs');
const path = require('path');

function findGitRoot() {
  const cwd = process.cwd();

  // Get directory containing .git directory or in the case of Git submodules, the .git file
  const gitDirOrFile = findUp.sync('.git', {cwd});

  if (gitDirOrFile === null) {
    throw new Error(`Can't find .git, skipping Git hooks.`);
  }

  // Resolve git directory (e.g. .git/ or .git/modules/path/to/submodule)
  const resolvedGitDir = resolveGitDir(gitDirOrFile);

  if (resolvedGitDir === null) {
    throw new Error(`Can't find resolved .git directory, skipping Git hooks.`);
  }

  return resolvedGitDir;
}

function resolveGitDir(gitDirOrFile) {
  const stats = fs.lstatSync(gitDirOrFile);

  // If it's a .git file resolve path
  if (stats.isFile()) {
    // Expect following format
    // git: pathToGit
    // On Windows pathToGit can contain ':' (example "gitdir: C:/Some/Path")
    const gitFileData = fs.readFileSync(gitDirOrFile, 'utf-8');
    const resolvedGitDir = gitFileData
      .split(':')
      .slice(1)
      .join(':')
      .trim();
    gitDirOrFile = path.resolve(path.dirname(gitDirOrFile), resolvedGitDir);
  }

  // Else return path to .git directory
  return gitDirOrFile;
}

function getMsgFilePath(index = 0) {
  // Husky stashes git hook parameters $* into a HUSKY_GIT_PARAMS (GIT_PARAMS if < 1.x) env var.
  const gitParams = process.env.HUSKY_GIT_PARAMS || process.env.GIT_PARAMS || '';

  // Throw a friendly error if the git params environment variable can't be found – the user may be missing Husky.
  if (!gitParams) {
    throw new Error(`Neither process.env.HUSKY_GIT_PARAMS nor process.env.GIT_PARAMS are set. Is a supported Husky version installed?`);
  }

  // Unfortunately, this will break if there are escaped spaces within a single argument;
  // I don't believe there's a workaround for this without modifying Husky itself
  return gitParams.split(' ')[index];
}

function getModifiedFiles(gitRoot) {
  return new Promise((resolve, reject) => {
    childProcess.exec(`git --git-dir=${gitRoot} diff --cached --name-only`, {encoding: 'utf-8'}, (err, stdout, stderr) => {
      if (err) {
        return reject(err);
      }
      if (stderr) {
        return reject(new Error(String(stderr)));
      }
      console.log('stdout3:' + stdout);
      resolve(String(stdout).trim());
    });
  });
}

function getScopes(modifiedFiles) {
  const patterns = [
    {regex: /web\/projects\/([^\s/]+)\/.*/, replace: '$1'},
    {regex: /web\/([^\s/]+)$/, replace: '$1'},
    {regex: /^([^\s/]+)\/[^\s/]+[^/]$/, replace: '$1'},
    {regex: /^[^\s/]+\/([^\s/]+)\/.*/, replace: '$1'},
    {regex: /(^[^/]+)$/, replace: 'root'}
  ]

  const modifiedFilesArray = modifiedFiles.split('\n');

  const scopes = new Set();
  for (const modifiedFile of modifiedFilesArray) {
    for (const pattern of patterns) {
      const matches = modifiedFile.match(pattern.regex);
      if (matches) {
        scopes.add(modifiedFile.replace(pattern.regex, pattern.replace));
        break;
      }
    }
  }

  if (!scopes.size === 0) {
    throw new Error(`No possible match, your regex must not be correctly set`);
  }

  return scopes;
}

function writeJiraTicket(jiraTicket) {
  const messageFilePath = getMsgFilePath();
  let message;

  // Read file with commit message
  try {
    message = fs.readFileSync(messageFilePath, {encoding: 'utf-8'});
  } catch (ex) {
    throw new Error(`Unable to read the file "${messageFilePath}".`);
  }

  // Add jira ticket into the message in case of missing
  if (message.indexOf(jiraTicket) < 0) {
    message = `[${jiraTicket}]\n${message}`;
  }

  // Write message back to file
  try {
    fs.writeFileSync(messageFilePath, message, {encoding: 'utf-8'});
  } catch (ex) {
    throw new Error(`Unable to write the file "${messageFilePath}".`);
  }
}

module.exports = {
  findGitRoot,
  getModifiedFiles,
  getScopes,
  writeJiraTicket
};
