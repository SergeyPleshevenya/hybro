import React from 'react';
import { WebView as RNWebView, } from 'react-native';
import { WebView, } from 'react-native-webview-messaging/WebView';
import PropTypes from 'prop-types';
import uuid from 'uuid/v1';


import { stringify, parse, } from '../common/json';
import * as TYPES from '../common/types';


export class HybroView extends React.Component {

    static propTypes = {
        ...RNWebView.propTypes,
        packages: PropTypes.object.isRequired,
    }

    webListeners = {};
    webEventCommands = [];


    componentDidMount() {
        if (this.webview && this.webview.messagesChannel) {
            this.webview.messagesChannel.addListener('json', this.onWebMessage);
        }
        else {
            console.warn('Hybro: no webview', 'componentDidMount');
        }
    }

    componentWillUnmount() {
        if (this.webview && this.webview.messagesChannel) {
            this.webview.messagesChannel.removeListener('json', this.onWebMessage);
        }
        else {
            console.warn('Hybro: no webview', 'componentWillUnmount');
        }

        this.removeAllListeners();
    }

    removeAllListeners() {
        this.webEventCommands.forEach(command => {
            command.type = TYPES.REMOVE_EVENT_LISTENER;
            this.onRemoveListener(command);
        });
    }

    onWebMessage = (command) => {
        command.args = parse(command.args);

        switch (command.type) {
            case TYPES.INVOKE:
                this.onInvoke(command);
                break;
            case TYPES.ADD_EVENT_LISTENER:
                this.onAddListener(command);
                break;
            case TYPES.REMOVE_EVENT_LISTENER:
                this.onRemoveListener(command);
                break;
        }
    }

    onInvoke = (command) => {
        try {
            let [pckg, mdl, method, params] = command.args;
            params = params || [];

            Promise.all([
                this.props.packages[pckg][mdl][method](...params),
            ])
                .then(([result]) => {
                    this.sendResult(command, TYPES.SUCCESS, result);
                }, (error) => {
                    this.sendResult(command, TYPES.ERROR, { message: error && error.message || '', });
                });
        }
        catch (error) {
            this.sendResult(command, TYPES.ERROR, { message: error && error.message || '', });
        }
    }

    onAddListener = (command) => {
        try {
            let [pckg, mdl, eventName] = command.args;

            let handler = (result) => {
                this.sendResult(command, TYPES.EVENT, result);
            };

            let result = this.props.packages[pckg][mdl].addEventListener(eventName, handler);

            this.webListeners[`${pckg}_${mdl}_${eventName}_${command.id}`] = handler;
            this.webEventCommands.push(command);

            this.sendResult(command, TYPES.SUCCESS, result);
        }
        catch (error) {
            this.sendResult(command, TYPES.ERROR, { message: error && error.message || '', });
        }
    }

    onRemoveListener = (command) => {
        try {
            let [pckg, mdl, eventName] = command.args;

            let handler = this.webListeners[`${pckg}_${mdl}_${eventName}_${command.id}`];

            this.webEventCommands = this.webEventCommands.filter(({ args: [pckg2, mdl2, eventName2] }) =>
                pckg != pckg2 || mdl != mdl2 || eventName != eventName2
            );

            let result = this.props.packages[pckg][mdl].removeEventListener(eventName, handler);

            this.sendResult(command, TYPES.SUCCESS, result);
        }
        catch (error) {
            this.sendResult(command, TYPES.ERROR, { message: error && error.message || '', });
        }
    }

    render() {
        let { packages, ...others } = this.props;

        return (
            <WebView
                ref={this.handleRef}
                {...others}
            />
        );
    }

    sendResult = (command, type, result) => {
        if (this.webview && this.webview.messagesChannel) {
            result = stringify(result);

            let id = uuid(),
                index = 0,
                size = 100000,
                parts = Math.ceil(result.length / size);

            while (result) {
                this.webview.sendJSON({
                    type,
                    id,
                    commandId: command.id,
                    result: result.substr(0, size),
                    parts,
                    index,
                });
                result = result.substr(size);
                ++index;
            }
        }
        else {
            console.warn('Hybro: no webview', command, type, result);
        }
    }

    handleRef = (webview) => {
        this.webview = webview;
    }

}
