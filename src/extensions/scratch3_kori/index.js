const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const log = require('../../util/log');
const cast = require('../../util/cast');
const formatMessage = require('format-message');
const BLE = require('../../io/ble');
const Base64Util = require('../../util/base64-util');
const { Console } = require('minilog');
const EventEmitter = require('events');

/**
 * Icon png to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI0LjMuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkNhcGFfMyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeD0iMHB4IiB5PSIwcHgiCgkgd2lkdGg9IjQwcHgiIGhlaWdodD0iNDBweCIgdmlld0JveD0iMCAwIDQwIDQwIiBlbmFibGUtYmFja2dyb3VuZD0ibmV3IDAgMCA0MCA0MCIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+CjxnIGlkPSJGYWNlXzJfIj4KCTxlbGxpcHNlIGZpbGw9IiMxQTI3MkMiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIiBjeD0iMjAiIGN5PSIyMCIgcng9IjE5LjQiIHJ5PSIxOS40Ii8+Cgk8ZyBpZD0iQ2FwYV81XzFfIj4KCQk8ZyBpZD0iT2pvc18xXyI+CgkJCTxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0xMC43LDIzLjdjLTIuOCwwLTUuMS0yLjMtNS4xLTUuMXMyLjMtNS4xLDUuMS01LjFzNS4xLDIuMyw1LjEsNS4xUzEzLjUsMjMuNywxMC43LDIzLjd6IE0xMC43LDE0LjYKCQkJCWMtMi4yLDAtNCwxLjgtNCw0czEuOCw0LDQsNHM0LTEuOCw0LTRTMTIuOSwxNC42LDEwLjcsMTQuNnoiLz4KCQkJPHBhdGggZmlsbD0iI0ZGRkZGRiIgZD0iTTI4LjQsMjMuN2MtMi44LDAtNS4xLTIuMy01LjEtNS4xczIuMy01LjEsNS4xLTUuMXM1LjEsMi4zLDUuMSw1LjFTMzEuMiwyMy43LDI4LjQsMjMuN3ogTTI4LjQsMTQuNgoJCQkJYy0yLjIsMC00LDEuOC00LDRzMS44LDQsNCw0czQtMS44LDQtNFMzMC42LDE0LjYsMjguNCwxNC42eiIvPgoJCTwvZz4KCQk8ZyBpZD0iQm9jYV8xXyI+CgkJCTxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0yMC4xLDMwLjFoLTAuMWMtMi4xLTAuMS0zLjctMS4zLTMuNy0yLjloMS4yYzAsMC45LDEuMiwxLjcsMi42LDEuN2MxLjQsMCwyLjYtMC44LDIuNi0xLjdoMS4xCgkJCQlDMjMuOCwyOC44LDIyLjIsMzAuMSwyMC4xLDMwLjFMMjAuMSwzMC4xeiIvPgoJCTwvZz4KCQk8ZyBpZD0iQnJpbGxvXzFfIj4KCQkJPGVsbGlwc2UgZmlsbD0iI0ZGRkZGRiIgY3g9IjkuNyIgY3k9IjE4LjIiIHJ4PSIxLjMiIHJ5PSIxLjMiLz4KCQkJPGVsbGlwc2UgZmlsbD0iI0ZGRkZGRiIgY3g9IjI3LjEiIGN5PSIxOC4yIiByeD0iMS4zIiByeT0iMS4zIi8+CgkJPC9nPgoJPC9nPgo8L2c+Cjwvc3ZnPgo=';

/**
 * A time interval to wait (in milliseconds) before reporting to the BLE socket
 * that data has stopped coming from the peripheral.
 */
const BLETimeout = 4500;

/**
 * A time interval to wait (in milliseconds) while a block that sends a BLE message is running.
 * @type {number}
 */
const BLESendInterval = 100;

let emitter = new EventEmitter();
let dataBuffer = Buffer.alloc(0); // Inicializa un buffer vacío
let eventIndex = 0;

/**
 * A string to report to the BLE socket when the kori has stopped receiving data.
 * @type {string}
 */
const BLEDataStoppedError = 'kori extension stopped receiving data';

/**
 * Enum for kori protocol.
 * https://github.com/scratchfoundation/scratch-microbit-firmware/blob/master/protocol.md
 * @readonly
 * @enum {string}
 */
const BLEUUID = {
    service: '799d5f0d-0003-0000-a6a2-da053e2a640a',
    rxChar: '799d5f0d-0003-0001-a6a2-da053e2a640a',
    txChar: '799d5f0d-0003-0001-a6a2-da053e2a640a'
};

/**
 * Enum for kori events.
 * @readonly
 * @enum {string}
 */
const KoriEvents = {
    WAKE: 'wake',
    TRANSCRIBE: 'transcribe',
    GENERATE: 'generate',
    SYNTHESIZE: 'synthesize',
    PLAY: 'play',
    TOUCH: 'touch'
}

/**
 * Enum for network information.
 * @readonly
 * @enum {string}
 */
const network = {
    SSID: 'ssid',
    PSK: 'psk',
    IP: 'ip'
};

/**
 * Enum for listen information.
 * @readonly
 * @enum {string}
 */
const listen = {
    MODEL: 'model',
    LANGUAGE: 'language',
    TEPERATURE: 'temperature'
};

/**
 * Enum for think information.
 * @readonly
 * @enum {string}
 */
const think = {
    MODEL: 'model',
    ASSISTANT_ID: 'assistantId',
    INSTRUCTIONS: 'instructions',
    TEPERATURE: 'temperature'
}

/**
 * Enum for speak information.
 * @readonly
 * @enum {string}
 */
const speak = {
    MODEL: 'model',
    VOICE: 'voice',
    SPEED: 'speed'
}

/**
 * Enum for voice information.
 * @readonly
 * @enum {string}
 */
const voice = {
    ALLOY: 'alloy',
    ECHO: 'echo',
    FABLE: 'fable',
    ONYX: 'onyx',
    NOVA: 'nova',
    SHIMMER: 'shimmer'
}

/**
 * Enum for api information.
 * @readonly
 * @enum {string}
 * 
 */
const api = {
    OPENAI: 'openai',
    PICOVOICE: 'picovoice'
};

/**
 * Enum for personalization information.
 * @readonly
 * @enum {string}
 */
const personalization = {
    NAME: 'name',
    GENDER: 'gender',
    TYPE: 'type',
    WAKE_WORD: 'wakeWord'
}

/**
 *  Default value for unknown information.
 */
const unknown = 'UNINITIALIZED';

/**
 * Manage communication with a Kori peripheral over a Scrath Link client socket.
 */
class Kori {

    /**
     * Construct a Kori communication object.
     * @param {Runtime} runtime - the Scratch 3.0 runtime
     * @param {string} extensionId - the id of the extension
     */
    constructor(runtime, extensionId) {

        /**
         * The Scratch 3.0 runtime used to trigger the green flag button.
         * @type {Runtime}
         * @private
         */
        this._runtime = runtime;

        /**
         * The BluetoothLowEnergy connection socket for reading/writing peripheral data.
         * @type {BLE}
         * @private
         */
        this._ble = null;
        this._runtime.registerPeripheralExtension(extensionId, this);

        /**
         * The id of the extension this peripheral belongs to.
         */
        this._extensionId = extensionId;

        /**
         * The most recently received value for each network information.
         * @type {Object.<string, string>}
         * @private
         */
        this._network = {
            ssid: unknown,
            psk: unknown,
            ip: unknown
        };

        /**
         * The most recently received value for each listen information.
         * @type {Object.<string, string>}
         * @private
         */
        this._listen = {
            model: unknown,
            language: unknown,
            temperature: unknown
        };

        /**
         * The most recently received value for each think information.
         * @type {Object.<string, string>}
         * @private
         */
        this._think = {
            model: unknown,
            assistantId: unknown,
            instructions: unknown,
            temperature: unknown
        };

        /**
         * The most recently received value for each speak information.
         * @type {Object.<string, string>}
         * @private
         */
        this._speak = {
            model: unknown,
            voice: unknown,
            speed: unknown
        };

        /**
         * The most recently received value for each api information.
         * @type {Object.<string, string>}
         * @private
         */
        this._api = {
            openai: unknown,
            picovoice: unknown
        };

        /**
         * The most recently received value for each personalization information.
         * @type {Object.<string, string>}
         * @private
         */
        this._personalization = {
            name: unknown,
            gender: unknown,
            type: unknown,
            wakeWord: unknown
        };

        /**
         * Interval ID for data reading timeout.
         * @type {number}
         * @private
         */
        this._timeoutID = null;

        /**
         * A flag that is true while we are busy sending data to the BLE socket.
         * @type {boolean}
         * @private
         */
        this._busy = false;

        /**
         * ID for a timeout which is used to clear the busy flag if it has been
         * true for a long time.
         */
        this._busyTimeoutID = null;

        this.fullMessage = '';

        this.reset = this.reset.bind(this);
        this._onConnect = this._onConnect.bind(this);
        this._onMessage = this._onMessage.bind(this);
        this._reset = this._reset.bind(this);
    }

    /**
     * @param {string} text - the text to display.
     * @return {Promise} - a Promise that resolves when writing to peripheral.
     */
    displayText(text) {
        const output = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) {
            output[i] = text.charCodeAt(i);
        }
        return this.send(output);
    }

    /**
     * Called by the runtime when user wants to scan for a peripheral.
     */
    scan() {
        if (this._ble) {
            this._ble.disconnect();
        }
        this._ble = new BLE(this._runtime, this._extensionId, {
            filters: [
                { services: [BLEUUID.service] }
            ]
        }, this._onConnect, this.reset);
    }

    /**
     * Called by the runtime when user wants to connect to a certain peripheral.
     * @param {number} id - the id of the peripheral to connect to.
     */
    connect(id) {
        if (this._ble) {
            this._ble.connectPeripheral(id);
        }
    }

    /**
     * Disconnect from the kori.
     */
    disconnect() {
        if (this._ble) {
            this._ble.disconnect();
        }

        this.reset();
    }

    /**
     * Reset all the state and timeout/interval ids.
     */
    reset() {
        if (this._timeoutID) {
            window.clearTimeout(this._timeoutID);
            this._timeoutID = null;
        }
    }

    /**
     * Return true if connected to the kori.
     * @return {boolean} - whether the kori is connected.
     */
    isConnected() {
        let connected = false;
        if (this._ble) {
            connected = this._ble.isConnected();
        }
        return connected;
    }

    _reset() {
        this._busy = false;
        window.clearTimeout(this._busyTimeoutID);
    }

    /**
     * Send a message to the peripheral BLE socket.
     * @param {Uint8Array} message - the message to write
     */
    send(message) {
        if (!this.isConnected()) return;
        if (this._busy) return;

        // Set a busy flag so that while we are sending a message and waiting for
        // the response, additional messages are ignored.
        this._busy = true;

        // Set a timeout after which to reset the busy flag. This is used in case
        // a BLE message was sent for which we never received a response, because
        // e.g. the peripheral was turned off after the message was sent. We reset
        // the busy flag after a while so that it is possible to try again later.
        this._busyTimeoutID = window.setTimeout(() => {
            this._busy = false;
        }, 5000);
        const output = new Uint8Array(message.length + 1);

        for (let i = 0; i < message.length; i++) {
            output[i] = message[i];
        }
        output[message.length + 1] = '\0'; // null terminator
        const data = Base64Util.uint8ArrayToBase64(output);

        return new Promise(async (resolve) => {
            let chunks = [];
            for (let i = 0; i < data.length; i += 180) {
                chunks.push(data.substring(i, i + 180));
            }

            for (let chunk of chunks) {
                await this.sendChunk(chunk);
                await new Promise(r => setTimeout(r, 200)); // Espera 200ms
            }
            resolve();
        });
    }

    // UTILITIES

    async sendChunk(chunk) {
        return new Promise((resolve, reject) => {
            this._ble.write(BLEUUID.service, BLEUUID.txChar, chunk, 'base64', true).then(
                () => {
                    this._busy = false;
                    window.clearTimeout(this._busyTimeoutID);
                    resolve();
                }
            ).catch(err => {
                reject(err);
            });
        });
    }

    /**
     * Starts reading data from peripheral after BLE has connected to it.
     * @private
     */
    _onConnect() {

        this._ble.startNotifications(BLEUUID.service, BLEUUID.rxChar, this._onMessage);
        this._ble.didReceiveCall('read', { serviceId: BLEUUID.service, characteristicId: BLEUUID.rxChar });

        //this._timeoutID = window.setTimeout(
        //    () => this._ble.handleDisconnectError(BLEDataStoppedError),
        //    BLETimeout
        //);
    }

    _onMessage(data) {
        // Crea un objeto Buffer con los datos que lleguen y los concatena al buffer temporal hasta recibir el caracter nulo
        dataBuffer = Buffer.concat([dataBuffer, Buffer.from(data, 'base64')]);
        // Verifica si el buffer temporal contiene el caracter nulo
        if (dataBuffer.includes(0x00)) { // Caracter nulo indica que se ha terminado de enviar el mensaje
            // Procesa los datos completos
            try {
                let bufWithoutLast = dataBuffer.slice(0, dataBuffer.length - 1);
                let json = JSON.parse(bufWithoutLast.toString());
                if (emitter.emit(json.event, JSON.stringify(json.response))) {
                    //console.log('Event emitted: ', json.event);
                } else {
                    //console.log('Event not emitted: ', json.event);
                }; // In order to release the control from each block
            } catch (e) { // No es un objeto JSON
                console.log('No es un objeto JSON', e);
                return;
            }
            // Resetea el buffer para el próximo mensaje
            dataBuffer = Buffer.alloc(0);
        }
    }
}

/**
 * Scratch 3.0 blocks to interact with a Kori peripheral.
 */
class Scratch3KoriBlocks {

    /**
     * @return {string} - the name of this extension.
     */
    static get EXTENSION_NAME() {
        return 'Assistant';
    }

    /**
     * @return {string} - the ID of this extension.
     */
    static get EXTENSION_ID() {
        return 'kori';
    }

    get NETWORK_MENU() {
        return [
            {
                text: formatMessage({
                    id: 'kori.networkMenu.ssid',
                    default: 'name',
                    description: 'label for ssid network'
                }),
                value: network.SSID
            },
            {
                text: formatMessage({
                    id: 'kori.networkMenu.psk',
                    default: 'password',
                    description: 'label for psk network'
                }),
                value: network.PSK
            },
            {
                text: formatMessage({
                    id: 'kori.networkMenu.ip',
                    default: 'ip',
                    description: 'label for ip network'
                }),
                value: network.IP
            }
        ]
    }

    get API_MENU() {
        let menuItems = [
            {
                text: formatMessage({
                    id: 'kori.apiMenu.openai',
                    default: 'openai',
                    description: 'label for openai api'
                }),
                value: api.OPENAI
            },
            {
                text: formatMessage({
                    id: 'kori.apiMenu.picovoice',
                    default: 'picovoice',
                    description: 'label for picovoice api'
                }),
                value: api.PICOVOICE
            }
        ];
        return menuItems;
    }

    get LISTEN_MENU() {
        return [
            {
                text: formatMessage({
                    id: 'kori.listenMenu.model',
                    default: 'model',
                    description: 'label for model listen'
                }),
                value: listen.MODEL
            },
            {
                text: formatMessage({
                    id: 'kori.listenMenu.language',
                    default: 'language',
                    description: 'label for language listen'
                }),
                value: listen.LANGUAGE
            },
            {
                text: formatMessage({
                    id: 'kori.listenMenu.temperature',
                    default: 'temperature',
                    description: 'label for temperature listen'
                }),
                value: listen.TEPERATURE
            }
        ]
    }

    get THINK_MENU() {
        return [
            {
                text: formatMessage({
                    id: 'kori.thinkMenu.model',
                    default: 'model',
                    description: 'label for model think'
                }),
                value: think.MODEL
            },
            {
                text: formatMessage({
                    id: 'kori.thinkMenu.assistantId',
                    default: 'assistantId',
                    description: 'label for assistantId think'
                }),
                value: think.ASSISTANT_ID
            },
            {
                text: formatMessage({
                    id: 'kori.thinkMenu.instructions',
                    default: 'instructions',
                    description: 'label for instructions think'
                }),
                value: think.INSTRUCTIONS
            },
            {
                text: formatMessage({
                    id: 'kori.thinkMenu.temperature',
                    default: 'temperature',
                    description: 'label for temperature think'
                }),
                value: think.TEPERATURE
            }
        ]
    }

    get SPEAK_MENU() {
        return [
            {
                text: formatMessage({
                    id: 'kori.speakMenu.model',
                    default: 'model',
                    description: 'label for model speak'
                }),
                value: speak.MODEL
            },
            {
                text: formatMessage({
                    id: 'kori.speakMenu.voice',
                    default: 'voice',
                    description: 'label for voice speak'
                }),
                value: speak.VOICE
            },
            {
                text: formatMessage({
                    id: 'kori.speakMenu.speed',
                    default: 'speed',
                    description: 'label for speed speak'
                }),
                value: speak.SPEED
            }
        ]
    }

    get PERSONALIZATION_MENU() {
        return [
            {
                text: formatMessage({
                    id: 'kori.personalizationMenu.name',
                    default: 'name',
                    description: 'label for name personalization'
                }),
                value: personalization.NAME
            },
            {
                text: formatMessage({
                    id: 'kori.personalization.gender',
                    default: 'gender',
                    description: 'label for gender personalization'
                }),
                value: personalization.GENDER
            },
            {
                text: formatMessage({
                    id: 'kori.personalization.type',
                    default: 'type',
                    description: 'label for type personalization'
                }),
                value: personalization.TYPE
            },
            {
                text: formatMessage({
                    id: 'kori.personalization.wakeWord',
                    default: 'wake word',
                    description: 'label for wake word personalization'
                }),
                value: personalization.WAKE_WORD
            }
        ]
    }

    get EVENTS_MENU() {
        return [
            {
                text: formatMessage({
                    id: 'kori.statesMenu.wakeWord',
                    default: 'wake',
                    description: 'label for wake word event'
                }),
                value: KoriEvents.WAKE
            },
            {
                text: formatMessage({
                    id: 'kori.statesMenu.transcribe',
                    default: 'transcribe',
                    description: 'label for transcribe event'
                }),
                value: KoriEvents.TRANSCRIBE
            },
            {
                text: formatMessage({
                    id: 'kori.statesMenu.generate',
                    default: 'generate',
                    description: 'label for generate event'
                }),
                value: KoriEvents.GENERATE
            },
            {
                text: formatMessage({
                    id: 'kori.statesMenu.synthesize',
                    default: 'synthesize',
                    description: 'label for synthesize event'
                }),
                value: KoriEvents.SYNTHESIZE
            },
            {
                text: formatMessage({
                    id: 'kori.statesMenu.play',
                    default: 'play',
                    description: 'label for play event'
                }),
                value: KoriEvents.PLAY
            },
            {
                text: formatMessage({
                    id: 'kori.statesMenu.touch',
                    default: 'touch',
                    description: 'label for touch event'
                }),
                value: KoriEvents.TOUCH
            }
        ]
    }

    /**
     * Construct a set of Kori blocks.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor(runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Create a new Kori peripheral instance
        this._peripheral = new Kori(this.runtime, Scratch3KoriBlocks.EXTENSION_ID);
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo() {
        return {
            id: Scratch3KoriBlocks.EXTENSION_ID,
            color1: '#FF9E91',
            color2: '#BC756B',
            color3: '#C77B71',
            name: Scratch3KoriBlocks.EXTENSION_NAME,
            blockIconURI: blockIconURI,
            showStatusButton: true,
            blocks: [
                /*
                {
                    opcode: 'whenEvent',
                    text: formatMessage({
                        id: 'kori.whenEvent',
                        default: 'when [EVENT]',
                        description: 'when the selected event is detected by the kori'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        EVENT: {
                            type: ArgumentType.STRING,
                            menu: 'events',
                            defaultValue: KoriEvents.WAKE
                        }
                    }
                },
                */
                {
                    opcode: 'getConfig',
                    text: formatMessage({
                        id: 'kori.getConfig',
                        default: 'get config',
                        description: 'get the configuration and set it to the blocks'
                    }),
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'getNetwork',
                    text: formatMessage({
                        id: 'kori.getNetwork',
                        default: 'network [NETWORK_PARAMETER]',
                        description: 'Get the network information'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        NETWORK_PARAMETER: {
                            type: ArgumentType.STRING,
                            menu: 'network',
                            defaultValue: network.SSID
                        }
                    }
                },
                {
                    opcode: 'getAPI',
                    text: formatMessage({
                        id: 'kori.getAPI',
                        default: 'api [API_PARAMETER]',
                        description: 'Get the api information'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        API_PARAMETER: {
                            type: ArgumentType.STRING,
                            menu: 'api',
                            defaultValue: api.OPENAI
                        }
                    }
                },
                {
                    opcode: 'getListen',
                    text: formatMessage({
                        id: 'kori.getListen',
                        default: 'listen [LISTEN_PARAMETER]',
                        description: 'Get the listen information'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        LISTEN_PARAMETER: {
                            type: ArgumentType.STRING,
                            menu: 'listen',
                            defaultValue: listen.MODEL
                        }
                    }
                },
                {
                    opcode: 'getThink',
                    text: formatMessage({
                        id: 'kori.getThink',
                        default: 'think [THINK_PARAMETER]',
                        description: 'Get the think information'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        THINK_PARAMETER: {
                            type: ArgumentType.STRING,
                            menu: 'think',
                            defaultValue: think.MODEL
                        }
                    }
                },
                {
                    opcode: 'getSpeak',
                    text: formatMessage({
                        id: 'kori.getSpeak',
                        default: 'speak [SPEAK_PARAMETER]',
                        description: 'Get the speak information'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        SPEAK_PARAMETER: {
                            type: ArgumentType.STRING,
                            menu: 'speak',
                            defaultValue: speak.MODEL
                        }
                    }
                },
                {
                    opcode: 'getPersonalization',
                    text: formatMessage({
                        id: 'kori.getPersonalization',
                        default: 'personalization [PERSONALIZATION_PARAMETER]',
                        description: 'Get the personalization information'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        PERSONALIZATION_PARAMETER: {
                            type: ArgumentType.STRING,
                            menu: 'personalization',
                            defaultValue: personalization.NAME
                        }
                    }
                },
                '---',
                {
                    opcode: 'ask',
                    text: formatMessage({
                        id: 'kori.ask',
                        default: 'ask [QUESTION] and wait',
                        description: 'ask a question'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        QUESTION: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'kori.defaultQuestion',
                                default: 'What is your name?',
                                description: 'default question to ask'
                            })
                        }
                    }
                },
                {
                    opcode: 'getAnswer',
                    text: formatMessage({
                        id: 'kori.getAnswer',
                        default: 'answer',
                        description: 'get the answer'
                    }),
                    blockType: BlockType.REPORTER
                },
                '---',
                {
                    opcode: 'synthesize',
                    text: formatMessage({
                        id: 'kori.synthesize',
                        default: 'synthesize [TEXT]',
                        description: 'synthesize text'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'kori.defaultText',
                                default: 'Hello, world!',
                                description: 'default text to synthesize'
                            })
                        }
                    }
                },
                {
                    opcode: 'speak',
                    text: formatMessage({
                        id: 'kori.speak',
                        default: 'speak',
                        description: 'speak the synthesized text'
                    }),
                    blockType: BlockType.COMMAND,
                },
            ],
            menus: {
                network: {
                    acceptReporters: false,
                    items: this.NETWORK_MENU
                },
                api: {
                    acceptReporters: false,
                    items: this.API_MENU
                },
                listen: {
                    acceptReporters: false,
                    items: this.LISTEN_MENU
                },
                think: {
                    acceptReporters: false,
                    items: this.THINK_MENU
                },
                speak: {
                    acceptReporters: false,
                    items: this.SPEAK_MENU
                },
                personalization: {
                    acceptReporters: false,
                    items: this.PERSONALIZATION_MENU
                },
                events: {
                    acceptReporters: false,
                    items: this.EVENTS_MENU
                },
            }
        };
    }

    whenEvent(args) {
        const event = cast.toString(args.EVENT);
        if (event === 'wake') {
            return (this._peripheral.gestureState >> 3) & 1;
        } else if (event === 'transcribe') {
            return (this._peripheral.gestureState >> 4) & 1;
        } else if (event === 'generate') {
            return (this._peripheral.gestureState >> 5) & 1;
        } else if (event === 'synthesize') {
            return (this._peripheral.gestureState >> 6) & 1;
        } else if (event === 'play') {
            return (this._peripheral.gestureState >> 7) & 1;
        } else if (event === 'touch') {
            return (this._peripheral.gestureState >> 8) & 1;
        }
        return false;
    }

    getNetwork(args) {
        const networkParameter = cast.toString(args.NETWORK_PARAMETER);
        if (networkParameter === network.SSID) {
            return this._peripheral._network.ssid;
        } else if (networkParameter === network.PSK) {
            return this._peripheral._network.psk;
        } else if (networkParameter === network.IP) {
            return this._peripheral._network.ip;
        }
        return 'ERROR';
    }

    getAPI(args) {
        const apiParameter = cast.toString(args.API_PARAMETER);
        if (apiParameter === api.OPENAI) {
            return this._peripheral._api.openai;
        } else if (apiParameter === api.PICOVOICE) {
            return this._peripheral._api.picovoice;
        }
        return 'ERROR';
    }

    getListen(args) {
        const listenParameter = cast.toString(args.LISTEN_PARAMETER);
        if (listenParameter === listen.MODEL) {
            return this._peripheral._listen.model;
        } else if (listenParameter === listen.LANGUAGE) {
            return this._peripheral._listen.language;
        } else if (listenParameter === listen.TEPERATURE) {
            return this._peripheral._listen.temperature;
        }
        return 'ERROR';
    }

    getThink(args) {
        const thinkParameter = cast.toString(args.THINK_PARAMETER);
        if (thinkParameter === think.MODEL) {
            return this._peripheral._think.model;
        } else if (thinkParameter === think.ASSISTANT_ID) {
            return this._peripheral._think.assistantId;
        } else if (thinkParameter === think.INSTRUCTIONS) {
            return this._peripheral._think.instructions;
        } else if (thinkParameter === think.TEPERATURE) {
            return this._peripheral._think.temperature;
        }
        return 'ERROR';
    }

    getSpeak(args) {
        const speakParameter = cast.toString(args.SPEAK_PARAMETER);
        if (speakParameter === speak.MODEL) {
            return this._peripheral._speak.model;
        } else if (speakParameter === speak.VOICE) {
            return this._peripheral._speak.voice;
        } else if (speakParameter === speak.SPEED) {
            return this._peripheral._speak.speed;
        }
        return 'ERROR';
    }

    getPersonalization(args) {
        const personalizationParameter = cast.toString(args.PERSONALIZATION_PARAMETER);
        if (personalizationParameter === personalization.NAME) {
            return this._peripheral._personalization.name;
        } else if (personalizationParameter === personalization.GENDER) {
            return this._peripheral._personalization.gender;
        }
        else if (personalizationParameter === personalization.TYPE) {
            return this._peripheral._personalization.type;
        }
        else if (personalizationParameter === personalization.WAKE_WORD) {
            return this._peripheral._personalization.wakeWord;
        }
        return 'ERROR';
    }

    /**
     *  Get the configuration from the peripheral
     * @returns {Promise} - a Promise that resolves when the configuration is received
     */
    getConfig() {
        eventIndex++;
        const text = JSON.stringify({
            event: `event${eventIndex}`,
            cmd: "get_config",
            args: {
            }
        });

        return new Promise(resolve => {
            this._peripheral.displayText(text)
                .then(() => {
                    emitter.once(`event${eventIndex}`, (res) => {
                        const resJson = JSON.parse(res);

                        //console.log('Config received: ', JSON.stringify(resJson, null, 3));

                        // Network
                        //this._peripheral._network.ssid = resJson.network.ssid;
                        //this._peripheral._network.psk = resJson.network.psk;
                        //this._peripheral._network.ip = resJson.network.ip;

                        // Personalization
                        this._peripheral._personalization.wakeWord = resJson.device.wakeword;
                        this._peripheral._personalization.name = resJson.device.name;
                        this._peripheral._personalization.gender = resJson.device.gender;
                        this._peripheral._personalization.type = resJson.device.type;

                        // API
                        this._peripheral._api.openai = resJson.services.openAI.apiKey;
                        this._peripheral._api.picovoice = resJson.services.picoVoice.apiKey;

                        // Listen
                        this._peripheral._listen.model = resJson.services.openAI.whisper.model;
                        this._peripheral._listen.language = resJson.services.openAI.whisper.language;
                        this._peripheral._listen.temperature = resJson.services.openAI.whisper.temperature;

                        // Think
                        this._peripheral._think.model = resJson.services.openAI.chatGPT.model;
                        this._peripheral._think.assistantId = resJson.services.openAI.chatGPT.assistantId;
                        this._peripheral._think.instructions = resJson.services.openAI.chatGPT.instructions;
                        this._peripheral._think.temperature = resJson.services.openAI.chatGPT.temperature;

                        // Speak
                        this._peripheral._speak.model = resJson.services.openAI.tts.model;
                        this._peripheral._speak.voice = resJson.services.openAI.tts.voice;
                        this._peripheral._speak.speed = resJson.services.openAI.tts.speed;

                        resolve('INITIALIZED');
                    });
                });
        });
    }

    /**
     * 
     * @returns {string} - the answer
     */
    getAnswer() {
        return 'Hello';
    }

    /**
     * 
     * @param {object} args 
     */
    ask(args) {
        const question = cast.toString(args.QUESTION);
        //const event = KoriEvents.WAKE;
        //this._peripheral.send(event, question);
        console.log(question);
    }

    /**
     * 
     * @param {object} args 
     */
    synthesize(args) {
        const text = cast.toString(args.TEXT);
        eventIndex++;
        const event = `event${eventIndex}`;
        const cmd = 'synthesize';
        const argsJson = {
            text: text
        };
        const textJson = JSON.stringify({
            event: event,
            cmd: cmd,
            args: argsJson
        });
        console.log('Synthesize: ', args.TEXT);
        this._peripheral.displayText(textJson);
    }

    /**
     * 
     */
    speak() {
        eventIndex++;
        const event = `event${eventIndex}`;
        const cmd = 'speak';
        const argsJson = {};
        const textJson = JSON.stringify({
            event: event,
            cmd: cmd,
            args: argsJson
        });

        this._peripheral._ble.read(BLEUUID.service, BLEUUID.rxChar, true).then(() => {
            console.log('Reading from BLE');
            
        });

        //this._peripheral.displayText(textJson);
    }
}

module.exports = Scratch3KoriBlocks;
