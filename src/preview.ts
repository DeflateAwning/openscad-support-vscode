/*---------------------------------------------------------------------------------------------
 * Preview
 *
 * Stores a single instance of OpenSCAD
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as child from 'child_process';
import { type } from 'os';
import path from 'path';
import { ISignal, SignalDispatcher } from 'ste-signals';
import { DEBUG } from './config';
import commandExists = require('command-exists');

const pathByPlatform = {
    Linux: 'openscad',
    Darwin: '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
    Windows_NT: 'C:\\Program Files\\Openscad\\openscad.exe',
};

export type PreviewType = 'view' | 'output';

// Preview class to open instance of OpenSCAD
export class Preview {
    // Paths
    private static _scadPath: string;
    private static _isValidScadPath = false;
    private readonly _fileUri: vscode.Uri;
    private readonly _process: child.ChildProcess;
    private readonly _previewType: PreviewType;
    private _isRunning: boolean;
    private _onKilled = new SignalDispatcher();

    // Constructor
    private constructor(
        fileUri: vscode.Uri,
        previewType?: PreviewType,
        args?: string[] | undefined
    ) {
        // Set local arguments
        this._fileUri = fileUri;
        this._previewType = previewType ? previewType : 'view';

        const commandArgs: string[] = args
            ? args.concat(this._fileUri.fsPath)
            : [this._fileUri.fsPath];

        if (DEBUG) console.log(`commangArgs: ${commandArgs}`); // DEBUG

        const workspace = vscode.workspace.workspaceFolders.find(w => this._fileUri.fsPath.includes(w.uri.fsPath))
        this._process = child.spawn(Preview._scadPath, commandArgs, { cwd: workspace.uri.fsPath });
        this._process.stderr?.on('data', (data: Buffer) => {
            if (DEBUG) console.log(`stdout: ${data.toString()}`); // DEBUG
            vscode.window.showInformationMessage(data.toString()); // Display info
        });

        this._process.stdout?.on('data', (data: Buffer) => {
            if (DEBUG) console.log(`stdout: ${data.toString()}`); // DEBUG
            vscode.window.showInformationMessage(data.toString()); // Display info
        });

        this._process.on('close', (code) => {
            if (code != 0) {
                if (DEBUG) console.error(`stderr: Launch OpenSCAD failed!!! ${code}`); // DEBUG
                vscode.window.showErrorMessage(`Launch OpenSCAD failed!!! ${code}`); // Display error message
            }

            this._isRunning = false;
            this._onKilled.dispatch(); // Dispatch 'onKilled' event
        });

        // Child process is now running
        this._isRunning = true;
    }

    // Kill child process
    public dispose(): void {
        if (this._isRunning) this._process.kill();
        // this._isRunning = false;
    }

    // Returns if the given Uri is equivalent to the preview's Uri
    public matchUri(uri: vscode.Uri, previewType?: PreviewType): boolean {
        return (
            this._fileUri.toString() === uri.toString() &&
            this._previewType === (previewType ? previewType : 'view')
        );
    }

    // Return Uri
    public get uri(): vscode.Uri {
        return this._fileUri;
    }

    // Get if running
    public get isRunning(): boolean {
        return this._isRunning;
    }

    // On killed handlers
    public get onKilled(): ISignal {
        return this._onKilled.asEvent();
    }

    // Static factory method. Create new preview child process
    // Needed to make sure path to `openscad.exe` is defined
    public static create(
        resource: vscode.Uri,
        previewType?: PreviewType,
        args?: string[]
    ): Preview | undefined {
        // Error checking
        // Make sure scad path is defined
        if (!Preview._isValidScadPath) {
            if (DEBUG) console.error('OpenSCAD path is undefined in config');
            vscode.window.showErrorMessage('OpenSCAD path does not exist.');
            return undefined;
        }

        // If previewType is undefined, automatically assign it based on arguemnts
        if (!previewType)
            previewType = args?.some((item) => ['-o', '--o'].includes(item))
                ? 'output'
                : 'view';

        // New file
        return new Preview(resource, previewType, args);
    }

    // Used to set the path to `openscad.exe` on the system. Necessary to open children
    public static setScadPath(scadPath?: string): void {
        // Set OpenSCAD path if specified; otherwise use system default
        Preview._scadPath = scadPath
            ? scadPath
            : pathByPlatform[type() as keyof typeof pathByPlatform];

        if (DEBUG) console.log(`Path: '${Preview._scadPath}'`); // DEBUG

        // Verify 'openscad' command is valid
        Preview._isValidScadPath = false; // Set to false until can test if the command exists
        commandExists(Preview._scadPath, (err: null, exists: boolean) => {
            Preview._isValidScadPath = exists;
        });
    }

    public get previewType(): PreviewType {
        return this._previewType;
    }

    public static get scadPath(): string {
        return Preview._scadPath;
    }
    public static get isValidScadPath(): boolean {
        return Preview._isValidScadPath;
    }
}
