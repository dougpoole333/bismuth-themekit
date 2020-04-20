const {watch, src, dest} = require('gulp');
const sass = require('gulp-sass');
const replace = require('gulp-replace');
const touch = require('gulp-touch-fd');
const rename = require('gulp-rename')
const autoprefixer = require('gulp-autoprefixer');
const fs = require('fs')
const yaml = require('js-yaml');
const webpackStream = require('webpack-stream');
var liquid = require("gulp-liquidjs");
const filePath = require('path');
var browserSync = require('browser-sync').create();
require('isomorphic-fetch')

function getProps(cb) {
  var doc = yaml.safeLoad(fs.readFileSync('./config.yml', 'utf8'));
  return doc
}

const props = getProps()

function returnJSWebpackConfig(path){
  return {
    entry: {
      [filePath.parse(path).name]: "./" + path
    },
    output: {
      filename: '[name]-compiled.js',
      path: __dirname + '/assets'
    }, 
    mode: "production"
  }
}

function bundleTemplateJS(path){
  let config = returnJSWebpackConfig(path)
  return src(path)
    .pipe(webpackStream(config))
    .pipe(dest('assets'))
}

function browserSyncInit(){
 browserSync.init({
    proxy: {
      target: `https://${props.development.store}?preview_theme_id=${props.development.theme_id}`
    },
    snippetOptions: {
      rule: {
          match: /<\/body>/i,
          fn: function (snippet, match) {
              return snippet + match;
          }
      }
    },
  });
  watch(['./theme_reload']).on('all', function(){
    browserSync.reload()
  })
}

async function bundleAll(cb) {
    browserSyncInit()
    //watches assets and uploads to shopify
    watch(['./assets/*.*']).on('all', async function(event, path){
      await fs.readFile("./" + path,'utf8', async function(err,data){
        const asset_url = `https://${props.development.store}/admin/api/2019-10/themes/${props.development.theme_id}/assets.json`
        const body = JSON.stringify({asset: {key: path, value: data}})
        const assets = await fetch(asset_url, {
            method: 'PUT',
            headers: {
              "X-Shopify-Access-Token": props.development.password,
              'Content-Type': 'application/json',
            },
            body: body
          })
          .then(response => response.json())
          .then(json => {
            const filename = 'file.txt';
            const time = new Date();

            try {
              fs.utimesSync("./theme_reload", time, time);
            } catch (err) {
              fs.closeSync(fs.openSync("./theme_reload", 'w'));
            }
          });
      })
    })
    //watches template files
    watch(['./scripts/templates/*.js'], { ignoreInitial: false }).on('all', function(event, path){
      console.log(path)
      bundleTemplateJS(path)
    })
    //watches modules
    watch(['./scripts/components/*.js']).on('all', function(event, path){
      let moduleName = filePath.parse(path).name
      fs.readdir("./scripts/templates/", function (err, files) {
        files.forEach(function (file) {
            // Do whatever you want to do with the file
            fs.readFile("./scripts/templates/" + file, function (err, data) {
              if (err) throw err;
              if(data.indexOf(moduleName) >= 0){
               bundleTemplateJS("scripts/templates/" + file)
              }
            });
        });
    });
    })

    watch(['./styles/**/*.scss'], { ignoreInitial: false }).on('all', function(){
      return src('./styles/theme.scss')
      // .pipe(liquid())
      .pipe(sass({ outputStyle: 'compressed' }).on('error', sass.logError))
      // add vendor prefixes
      .pipe(autoprefixer())
      // change the file name to be styles.scss.liquid file
      .pipe(rename('styles.scss.liquid'))
      // remove the extra set of quotations used for escaping the liquid string (we'll explain this in a sec)
      .pipe(replace('"{{', '{{'))
      .pipe(replace('}}"', '}}'))
      // save the file to the theme assets directory
      .pipe(dest('assets'))
      .pipe(touch());
    })
    cb()

  }


  exports.watch = bundleAll;