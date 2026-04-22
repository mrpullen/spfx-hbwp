'use strict';

const build = require('@microsoft/sp-build-web');
const path = require('path');
const fs = require('fs');

// ── Merge local API permissions into package-solution.json before packaging ──
// If config/webApiPermissions-config.json exists, its webApiPermissionRequests
// array replaces the one in package-solution.json. The file is gitignored so
// tenant-specific permissions never reach the public repo.
// A backup is saved and restored after the build so the repo file stays clean.
const PKG_SOLUTION_PATH = path.resolve(__dirname, 'config', 'package-solution.json');
const LOCAL_PERMS_PATH = path.resolve(__dirname, 'config', 'webApiPermissions-config.json');
let _pkgSolutionBackup = null; // in-memory backup of original contents

const mergeApiPermissions = build.subTask('merge-api-permissions', function (gulp, buildOptions, done) {
  if (fs.existsSync(LOCAL_PERMS_PATH)) {
    // Save original file contents so we can restore after build
    _pkgSolutionBackup = fs.readFileSync(PKG_SOLUTION_PATH, 'utf8');

    const localPerms = JSON.parse(fs.readFileSync(LOCAL_PERMS_PATH, 'utf8'));
    const pkgSolution = JSON.parse(_pkgSolutionBackup);

    if (localPerms.webApiPermissionRequests) {
      // Merge: start with the repo permissions, then add/override from local.
      // Deduplicate by resource+scope key so no duplicates end up in the package.
      const base = pkgSolution.solution.webApiPermissionRequests || [];
      const local = localPerms.webApiPermissionRequests;
      const seen = new Set();
      const merged = [];

      // Local entries take priority (added first)
      for (const entry of local) {
        const key = entry.resource + '|' + entry.scope;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(entry);
        }
      }
      // Then add any repo entries that weren't already covered
      for (const entry of base) {
        const key = entry.resource + '|' + entry.scope;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(entry);
        }
      }

      pkgSolution.solution.webApiPermissionRequests = merged;
      fs.writeFileSync(PKG_SOLUTION_PATH, JSON.stringify(pkgSolution, null, 2) + '\n', 'utf8');
      console.log('[merge-api-permissions] Merged ' + merged.length + ' unique webApiPermissionRequests into package-solution.json');
    }
  } else {
    console.log('[merge-api-permissions] No webApiPermissions-config.json found — using package-solution.json as-is');
  }
  done();
});

const restoreApiPermissions = build.subTask('restore-api-permissions', function (gulp, buildOptions, done) {
  if (_pkgSolutionBackup !== null) {
    fs.writeFileSync(PKG_SOLUTION_PATH, _pkgSolutionBackup, 'utf8');
    _pkgSolutionBackup = null;
    console.log('[restore-api-permissions] Restored original package-solution.json');
  }
  done();
});

// Merge before build, restore after (including on failure)
build.rig.addPreBuildTask(mergeApiPermissions);
build.rig.addPostBuildTask(restoreApiPermissions);

// Safety net: restore original package-solution.json on process exit
// (covers build failures, SIGINT, unhandled errors — any exit path)
process.on('exit', function () {
  if (_pkgSolutionBackup !== null) {
    try {
      fs.writeFileSync(PKG_SOLUTION_PATH, _pkgSolutionBackup, 'utf8');
      _pkgSolutionBackup = null;
      console.log('[restore-api-permissions] Restored original package-solution.json (on exit)');
    } catch (_) { /* best-effort */ }
  }
});

build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);


build.addSuppression(
  /.\/node_modules/
);



build.addSuppression(
  `./node_modules/.pnpm/handlebars-helpers*`
);

build.addSuppression(
  `./node_modules/.pnpm/ansi-colors@0.2.0*`
);

build.addSuppression(
  `./node_modules/.pnpm/create-frame@1.0.0/node_modules/create-frame/utils.js 3:34-41`
);


build.addSuppression(
  `Critical dependency: *`
);

build.addSuppression(
  /Warning - lint - .*no-explicit-any/
);

var getTasks = build.rig.getTasks;
build.rig.getTasks = function () {
  var result = getTasks.call(build.rig);

  result.set('serve', result.get('serve-deprecated'));

  return result;
};

build.configureWebpack.mergeConfig({
  additionalConfiguration: (generatedConfiguration) => {


    generatedConfiguration.resolve.alias = { handlebars: 'handlebars/dist/handlebars.min.js' };


    generatedConfiguration.module.rules.push(
      {
        test: /\.mjs$/,
        include: /node_modules/,
        type: 'javascript/auto'
      },
    );

    

    generatedConfiguration.node = {
      fs: 'empty',
      readline: 'empty'
    }

    return generatedConfiguration;
  },
});

build.initialize(require('gulp'));
