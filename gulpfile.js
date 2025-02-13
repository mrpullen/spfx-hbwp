'use strict';

const build = require('@microsoft/sp-build-web');

build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);

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
