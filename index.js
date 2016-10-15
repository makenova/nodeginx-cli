#!/usr/bin/env node

var fs = require('fs');
var chalk = require('chalk');
var async = require('async');
var inquirer = require('inquirer');

var nodeginx = require('@makenova/nodeginx');

const CR = '\n';

// user actions
const toggleSiteStr = 'enable/disable a site';
const addSiteStr = 'add a site';
const addSitePathStr = 'enter path to config file';
const addSiteStaticTplStr = 'use static template';
const addSiteProxyTplStr = 'use proxy template';
const removeSiteStr = 'remove a site';
const manageNginxStr = 'start/stop/restart nginx';
const exitProgramStr = 'exit';

fs.readdir(nodeginx.constants.NGINX_PATH, (err, files) => {
  bail(err);
  var sitesFolders = files.some((file)=>{
    return file === nodeginx.constants.sitesAvailableStr || file === nodeginx.constants.sitesEnabledStr;
  });
  if (sitesFolders){
    fs.readdir(nodeginx.constants.NGINX_PATH + nodeginx.constants.sitesAvailableStr, (err, files) => {
      'use strict';
      bail(err);
      let sitesAvailable = files;
      fs.readdir(nodeginx.constants.NGINX_PATH + nodeginx.constants.sitesEnabledStr, (err, files) => {
        bail(err);
        let sitesEnabled = files;

        // print list of sites and mark them
        console.log(`${chalk.green('\u2714')} is enabled ${CR}${chalk.red('\u2718')} is disabled ${CR}`);
        let markedSites = sitesAvailable.map(site =>{
          let isEnabled = sitesEnabled.some( enabledSite => {
            return site === enabledSite;
          });
          if(isEnabled){
            console.log(site + chalk.green(' \u2714'));
            return {name: site, checked:isEnabled};
          }else{
            console.log(site + chalk.red(' \u2718'));
            return {name: site, checked:isEnabled};
          }
        });

        console.log(CR);

        // prep questions for user
        var questions = [
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              toggleSiteStr,
              addSiteStr,
              removeSiteStr,
              manageNginxStr,
              exitProgramStr
            ]
          },
          {
            type: 'checkbox',
            name: 'askToggleSite',
            message: 'Select sites to enable (spacebar to select):',
            choices: markedSites,
            when: function (answers){
              return answers.action === toggleSiteStr;
            }
          },
          {
            type: 'list',
            name: 'askAddSite',
            message: 'How would you like to add a site?',
            choices: [addSitePathStr, addSiteStaticTplStr, addSiteProxyTplStr],
            when: function (answers){
              return answers.action === addSiteStr;
            }
          },
          {
            type: 'input',
            name: 'askAddSiteConfig',
            message: 'Enter path to config file:',
            when: function (answers){
              return answers.askAddSite === addSitePathStr;
            }
          },
          {
            type: 'input',
            name: 'tplPort',
            message: 'What port is Nginx listening on?',
            default: '80',
            when: function (answers){
              return (answers.askAddSite === addSiteStaticTplStr ||
                answers.askAddSite === addSiteProxyTplStr);
            }
          },
          {
            type: 'input',
            name: 'tplServerName',
            message: 'Enter the site name:',
            when: function (answers){
              return Boolean(answers.tplPort);
            }
          },
          {
            type: 'input',
            name: 'tplSiteRoot',
            message: 'Enter the path to the site root:',
            when: function (answers){
              return Boolean(answers.askAddSite === addSiteStaticTplStr &&
                answers.tplServerName);
            }
          },
          {
            type: 'input',
            name: 'proxyServerIp',
            message: 'Enter the proxy server IP address:',
            default: '127.0.0.1',
            filter: (userport)=>{
              if (userport.toLowerCase() === 'localhost')
                userport = '127.0.0.1';
              return userport;
            },
            when: function (answers){
              return (answers.askAddSite === addSiteProxyTplStr &&
                answers.tplServerName);
            }
          },
          {
            type: 'input',
            name: 'proxyServerPort',
            message: 'Enter the proxy server port:',
            default: '8080',
            when: function (answers){
              return answers.proxyServerIp;
            }
          },
          {
            type: 'list',
            name: 'askRemoveSite',
            message: 'Select a site to remove',
            choices: sitesAvailable,
            when: function (answers){
              return answers.action === removeSiteStr;
            }
          },
          {
            type: 'confirm',
            name: 'askConfirmRemoveSite',
            message: (answers)=>{return `Are you sure you want to remove ${answers.askRemoveSite}:`;},
            default: false,
            when: function (answers){
              return answers.action === removeSiteStr;
            }
          },
          {
            type: 'list',
            name: 'askManageNginx',
            message: `Choose action:`,
            choices: [ 'start', 'stop', 'restart', 'reload', 'force-reload',
              'status', 'configtest', 'rotate', 'upgrade' ],
            default: false,
            when: function (answers){
              return answers.action === manageNginxStr;
            }
          }
        ];

        function xorleft (array0, array1){
          return array0.filter(array0element=>{
            return !array1.some(array1element=>{
              return array1element === array0element;
            });
          });
        }

        function toggleSites (sitesEnabled, askToggleSiteAnswers, callback) {
          var enabledSites = xorleft(askToggleSiteAnswers, sitesEnabled);
          var disabledSites = xorleft(sitesEnabled, askToggleSiteAnswers);
          async.series([
            // enable sites
            (callback)=>{ async.eachSeries(enabledSites, nodeginx.enableSite, callback); },
            // disable sites
            (callback)=>{ async.eachSeries(disabledSites, nodeginx.disableSite, callback); },
            // reload nginx configuration
            (callback)=>{
              nodeginx.manageNginx('reload', callback);
            }
          ], (err)=>{
            if (err) return callback(err);

            var sitestStateObj = {
              enabledSites: enabledSites,
              disabledSites: disabledSites
            };

            callback(null, sitestStateObj);
          });
        }

        // prompt user for action and handle user answers
        inquirer.prompt(questions)
        .then(function (answers) {
          if (answers.askToggleSite) {
            toggleSites(sitesEnabled, answers.askToggleSite, (err, sitestStateObj)=>{
              bail(err);
              if(sitestStateObj.enabledSites.length > 0)
                console.log(`Sites enabled: \n\t${sitestStateObj.enabledSites.join('\n\t')}`);
              if(sitestStateObj.disabledSites.length > 0)
                console.log(`Sites disabled: \n\t${sitestStateObj.disabledSites.join('\n\t')}`);
            });
          }else if (answers.askAddSite) {
            if (answers.askAddSite === addSitePathStr) {
              nodeginx.addSiteFromUserFile(answers, (err) => {
                bail(err)
                gracefulExit();
              })
            } else if (answers.askAddSite === addSiteStaticTplStr) {
              nodeginx.addStaticSite(answers, (err, msg)=>{
                bail(err);
                gracefulExit(msg);
              });
            } else {
              nodeginx.addProxySite(answers, (err, msg)=>{
                bail(err);
                gracefulExit(msg);
              });
            }
          }else if (answers.askConfirmRemoveSite) {
            nodeginx.removeSite(answers.askRemoveSite, (err)=>{
              bail(err);
              gracefulExit(`${answers.askRemoveSite} removed`);
            });
          }else if (answers.askManageNginx) {
            nodeginx.manageNginx(answers.askManageNginx, (err)=>{
              bail(err, `failed to ${answers.askManageNginx} nginx`);
              gracefulExit(`${answers.askManageNginx}ed nginx`);
            });
          }else {
            gracefulExit();
          }
        });
      });
    });
  }
});

// Utility
function gracefulExit(msg) {
  if (msg) console.log(msg);
  console.log('Bye!');
  process.exit(0);
}

function bail(err, msg){
  if (err) {
    if (msg) console.log(msg);
    console.log(err);
    process.exit(1);
  }
}
