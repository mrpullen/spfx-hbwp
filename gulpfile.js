'use strict';

const build = require('@microsoft/sp-build-web');

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
