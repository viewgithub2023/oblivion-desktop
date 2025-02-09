/* eslint-disable no-unused-expressions */
// warp-plus

import { app, ipcMain } from 'electron';
import treeKill from 'tree-kill';
import path from 'path';
import settings from 'electron-settings';
import { countries, defaultSettings } from '../../defaultSettings';
import { appendToLogFile, wpLogPath, writeToLogFile } from '../lib/log';
import { doesFileExist, isDev } from '../lib/utils';
import { disableProxy, enableProxy } from '../lib/proxy';

const { spawn } = require('child_process');

let child: any;

const randomCountry = () => {
    const randomIndex = Math.floor(Math.random() * countries.length);
    return countries[randomIndex]?.value ? countries[randomIndex]?.value : 'DE';
};

ipcMain.on('wp-start', async (event, arg) => {
    console.log('🚀 - ipcMain.on - arg:', arg);

    // in case user is using another proxy
    disableProxy();

    // reading user settings for warp
    const args = [];
    //const scan = await settings.get('scan');
    const endpoint = await settings.get('endpoint');
    const ipType = await settings.get('ipType');
    const port = await settings.get('port');
    //const psiphon = await settings.get('psiphon');
    const location = await settings.get('location');
    const license = await settings.get('license');
    //const gool = await settings.get('gool');
    const method = await settings.get('method');
    const autoSetProxy = await settings.get('autoSetProxy');
    const hostIP = (await settings.get('hostIP')) || defaultSettings.hostIP;

    // ! push one arg(flag) at a time
    // https://stackoverflow.com/questions/55328916/electron-run-shell-commands-with-arguments
    // ipType
    if (typeof ipType === 'string' && ipType !== '') {
        args.push(ipType);
    }
    // port, hostIP
    args.push('--bind');
    args.push(
        typeof port === 'string' || typeof port === 'number'
            ? `${hostIP}:${port}`
            : `${hostIP}:${defaultSettings.port}`
    );
    // license
    if (typeof license === 'string' && license !== '') {
        args.push('--key');
        args.push(license);
    }
    // gool or psiphon
    if (typeof method === 'string') {
        if (method === 'gool') {
            args.push('--gool');
        } else if (method === 'psiphon') {
            args.push(`--cfon`);
            if (typeof location === 'string' && location !== '') {
                args.push('--country');
                args.push(location);
            } else {
                args.push('--country');
                args.push(randomCountry());
            }
        }
    }
    // scan
    if (
        (typeof endpoint === 'string' &&
            (endpoint === '' || endpoint === defaultSettings.endpoint)) ||
        typeof endpoint === 'undefined'
    ) {
        args.push(`--scan`);
    } else {
        // endpoint
        args.push('--endpoint');
        args.push(
            typeof endpoint === 'string' && endpoint.length > 0
                ? endpoint
                : defaultSettings.endpoint
        );
    }

    const wpFileName = `warp-plus${process.platform === 'win32' ? '.exe' : ''}`;
    const wpDirPath = isDev()
        ? path.join(
              app.getAppPath().replace('/app.asar', '').replace('\\app.asar', ''),
              'assets',
              'bin'
          )
        : path.join(app.getPath('temp'));

    const command = path.join(wpDirPath, wpFileName);

    console.log('command: ', command, args);

    child = spawn(command, args, { cwd: wpDirPath });

    // TODO better approach
    const successMessage = `level=INFO msg="serving proxy" address=${hostIP}`;

    child.stdout.on('data', async (data: any) => {
        const strData = data.toString();
        console.log(strData);
        if (strData.includes(successMessage)) {
            event.reply('wp-start', true);
            if (
                (typeof autoSetProxy === 'boolean' && autoSetProxy) ||
                typeof autoSetProxy === 'undefined'
            ) {
                enableProxy();
            }
        }
        // write to log file
        const tmp = await doesFileExist(wpLogPath);
        if (!tmp) {
            writeToLogFile(strData);
        } else {
            appendToLogFile(strData);
        }
    });

    child.stderr.on('data', (err: any) => {
        console.log('err', err.toString());
    });

    child.on('exit', () => {
        event.reply('wp-end', true);
        disableProxy();
    });
});

ipcMain.on('wp-end', async (event) => {
    try {
        if (typeof child?.pid !== 'undefined') {
            treeKill(child.pid, 'SIGKILL');
        }
    } catch (error) {
        console.error(error);
        event.reply('wp-end', false);
    }
});
