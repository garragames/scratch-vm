const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const log = require('../../util/log');
const cast = require('../../util/cast');
const formatMessage = require('format-message');
const BLE = require('../../io/ble');
const Base64Util = require('../../util/base64-util');
const { Console } = require('minilog');

/**
 * Icon png to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI0LjMuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkNhcGFfMyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeD0iMHB4IiB5PSIwcHgiCgkgd2lkdGg9IjQwcHgiIGhlaWdodD0iNDBweCIgdmlld0JveD0iMCAwIDQwIDQwIiBlbmFibGUtYmFja2dyb3VuZD0ibmV3IDAgMCA0MCA0MCIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+CjxnIGlkPSJGYWNlXzJfIj4KCTxlbGxpcHNlIGZpbGw9IiMxQTI3MkMiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIiBjeD0iMjAiIGN5PSIyMCIgcng9IjE5LjQiIHJ5PSIxOS40Ii8+Cgk8ZyBpZD0iQ2FwYV81XzFfIj4KCQk8ZyBpZD0iT2pvc18xXyI+CgkJCTxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0xMC43LDIzLjdjLTIuOCwwLTUuMS0yLjMtNS4xLTUuMXMyLjMtNS4xLDUuMS01LjFzNS4xLDIuMyw1LjEsNS4xUzEzLjUsMjMuNywxMC43LDIzLjd6IE0xMC43LDE0LjYKCQkJCWMtMi4yLDAtNCwxLjgtNCw0czEuOCw0LDQsNHM0LTEuOCw0LTRTMTIuOSwxNC42LDEwLjcsMTQuNnoiLz4KCQkJPHBhdGggZmlsbD0iI0ZGRkZGRiIgZD0iTTI4LjQsMjMuN2MtMi44LDAtNS4xLTIuMy01LjEtNS4xczIuMy01LjEsNS4xLTUuMXM1LjEsMi4zLDUuMSw1LjFTMzEuMiwyMy43LDI4LjQsMjMuN3ogTTI4LjQsMTQuNgoJCQkJYy0yLjIsMC00LDEuOC00LDRzMS44LDQsNCw0czQtMS44LDQtNFMzMC42LDE0LjYsMjguNCwxNC42eiIvPgoJCTwvZz4KCQk8ZyBpZD0iQm9jYV8xXyI+CgkJCTxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0yMC4xLDMwLjFoLTAuMWMtMi4xLTAuMS0zLjctMS4zLTMuNy0yLjloMS4yYzAsMC45LDEuMiwxLjcsMi42LDEuN2MxLjQsMCwyLjYtMC44LDIuNi0xLjdoMS4xCgkJCQlDMjMuOCwyOC44LDIyLjIsMzAuMSwyMC4xLDMwLjFMMjAuMSwzMC4xeiIvPgoJCTwvZz4KCQk8ZyBpZD0iQnJpbGxvXzFfIj4KCQkJPGVsbGlwc2UgZmlsbD0iI0ZGRkZGRiIgY3g9IjkuNyIgY3k9IjE4LjIiIHJ4PSIxLjMiIHJ5PSIxLjMiLz4KCQkJPGVsbGlwc2UgZmlsbD0iI0ZGRkZGRiIgY3g9IjI3LjEiIGN5PSIxOC4yIiByeD0iMS4zIiByeT0iMS4zIi8+CgkJPC9nPgoJPC9nPgo8L2c+Cjwvc3ZnPgo=';

/**
 * Enum for kori BLE command protocol.
 * https://github.com/scratchfoundation/scratch-microbit-firmware/blob/master/protocol.md
 * @readonly
 * @enum {number}
 */
const BLECommand = {
    CMD_PIN_CONFIG: 0x80,
    CMD_DISPLAY_TEXT: 0x81,
    CMD_DISPLAY_LED: 0x82
};


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
 * Manage communication with a Kori peripheral over a Scrath Link client socket.
 */
class Kori {

    /**
     * Construct a Kori communication object.
     * @param {Runtime} runtime - the Scratch 3.0 runtime
     * @param {string} extensionId - the id of the extension
     */
    constructor (runtime, extensionId) {

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
         * The most recently received value for each sensor.
         * @type {Object.<string, number>}
         * @private
         */
        this._sensors = {
            tiltX: 0,
            tiltY: 0,
            buttonA: 0,
            buttonB: 0,
            touchPins: [0, 0, 0],
            gestureState: 0,
            ledMatrixState: new Uint8Array(5)
        };

        /**
         * The most recently received value for each gesture.
         * @type {Object.<string, Object>}
         * @private
         */
        this._gestures = {
            moving: false,
            move: {
                active: false,
                timeout: false
            },
            shake: {
                active: false,
                timeout: false
            },
            jump: {
                active: false,
                timeout: false
            }
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
    displayText (text) {
        const output = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) {
            output[i] = text.charCodeAt(i);
        }
        return this.send(BLECommand.CMD_DISPLAY_TEXT, output);
    }

    /**
     * @param {Uint8Array} matrix - the matrix to display.
     * @return {Promise} - a Promise that resolves when writing to peripheral.
     */
    displayMatrix (matrix) {
        return this.send(BLECommand.CMD_DISPLAY_LED, matrix);
    }

    /**
     * @return {number} - the latest value received for the tilt sensor's tilt about the X axis.
     */
    get tiltX () {
        return this._sensors.tiltX;
    }

    /**
     * @return {number} - the latest value received for the tilt sensor's tilt about the Y axis.
     */
    get tiltY () {
        return this._sensors.tiltY;
    }

    /**
     * @return {boolean} - the latest value received for the A button.
     */
    get buttonA () {
        return this._sensors.buttonA;
    }

    /**
     * @return {boolean} - the latest value received for the B button.
     */
    get buttonB () {
        return this._sensors.buttonB;
    }

    /**
     * @return {number} - the latest value received for the motion gesture states.
     */
    get gestureState () {
        return this._sensors.gestureState;
    }

    /**
     * @return {Uint8Array} - the current state of the 5x5 LED matrix.
     */
    get ledMatrixState () {
        return this._sensors.ledMatrixState;
    }

    /**
     * Called by the runtime when user wants to scan for a peripheral.
     */
    scan () {
        if (this._ble) {
            this._ble.disconnect();
        }
        this._ble = new BLE(this._runtime, this._extensionId, {
            filters: [
                {services: [BLEUUID.service]}
            ]
        }, this._onConnect, this.reset);
    }

    /**
     * Called by the runtime when user wants to connect to a certain peripheral.
     * @param {number} id - the id of the peripheral to connect to.
     */
    connect (id) {
        if (this._ble) {
            this._ble.connectPeripheral(id);
        }
    }

    /**
     * Disconnect from the kori.
     */
    disconnect () {
        if (this._ble) {
            this._ble.disconnect();
        }

        this.reset();
    }

    /**
     * Reset all the state and timeout/interval ids.
     */
    reset () {
        if (this._timeoutID) {
            window.clearTimeout(this._timeoutID);
            this._timeoutID = null;
        }
    }

    /**
     * Return true if connected to the kori.
     * @return {boolean} - whether the kori is connected.
     */
    isConnected () {
        let connected = false;
        if (this._ble) {
            connected = this._ble.isConnected();
        }
        return connected;
    }

    /**
     * Send a message to the peripheral BLE socket.
     * @param {number} command - the BLE command hex.
     * @param {Uint8Array} message - the message to write
     */
    send (command, message) {
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
        //output[0] = command; // attach command to beginning of message
        for (let i = 0; i < message.length; i++) {
            output[i] = message[i];
        }
        output[message.length + 1] = '\0'; // null terminator

        const data = Base64Util.uint8ArrayToBase64(output);

        this._ble.write(BLEUUID.service, BLEUUID.txChar, data, 'base64', true).then(
            () => {
                this._busy = false;
                window.clearTimeout(this._busyTimeoutID);
            }
        );
    }

    _reset () {
        this._busy = false;
        window.clearTimeout(this._busyTimeoutID);
    }

    send2(cmd) {

        return new Promise(async (resolve) => {
            let cmdChunks = [];
            for (let i = 0; i < cmd.length; i += 20) {
                cmdChunks.push(cmd.substring(i, i + 20));
            }

            for (let chunk of cmdChunks) {
                await this.sendChunk(chunk);
                await new Promise(r => setTimeout(r, 200)); // Espera 200ms
            }

            emitter.once('response', () => {
                resolve();
            });
        });
    }

    // UTILITIES

    async sendChunk(chunk) {
        let this2 = this;
        const output = new Uint8Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
            output[i] = chunk[i];
        }

        const data = Base64Util.uint8ArrayToBase64(output);
        return new Promise((resolve, reject) => {
            this._ble.write(BLEUUID.service, BLEUUID.txChar, data, 'base64', true).then(
                function () {
                    this2._busy = false;
                    window.clearTimeout(this2._busyTimeoutID);
                }
            );
        });
    }

    /**
     * Starts reading data from peripheral after BLE has connected to it.
     * @private
     */
    _onConnect () {

        this._ble.startNotifications(BLEUUID.service, BLEUUID.rxChar, this._onMessage);
        this._ble.didReceiveCall('read', { serviceId: BLEUUID.service, characteristicId: BLEUUID.rxChar });

        //this._timeoutID = window.setTimeout(
        //    () => this._ble.handleDisconnectError(BLEDataStoppedError),
        //    BLETimeout
        //);
    }

    /**
     * Process the sensor data from the incoming BLE characteristic.
     * @param {object} base64 - the incoming BLE data.
     * @private
     */
    //_onMessage (base64) {
    _onMessage (data) {
        //console.log('Data received: ', data);
        let message = Buffer.from(data, 'base64').toString();
        console.log('Message received: ', message);

        if (message === '\0') {
            //emitter.emit('response');
            console.log('EOL received');
            console.log('Full message: ', this.fullMessage);
            let messageJson = JSON.parse(this.fullMessage);
            console.log('Command received: ', messageJson.cmd);
            console.log('Response event: ', messageJson.event);
            console.log('Response received: ', messageJson.response);
            this.fullMessage = '';
            //return;
        } else {
            this.fullMessage += message;
        }


        /*
        this._sensors.tiltX = data[1] | (data[0] << 8);
        if (this._sensors.tiltX > (1 << 15)) this._sensors.tiltX -= (1 << 16);
        this._sensors.tiltY = data[3] | (data[2] << 8);
        if (this._sensors.tiltY > (1 << 15)) this._sensors.tiltY -= (1 << 16);

        this._sensors.buttonA = data[4];
        this._sensors.buttonB = data[5];

        this._sensors.touchPins[0] = data[6];
        this._sensors.touchPins[1] = data[7];
        this._sensors.touchPins[2] = data[8];

        this._sensors.gestureState = data[9];

        // cancel disconnect timeout and start a new one
        window.clearTimeout(this._timeoutID);
        this._timeoutID = window.setTimeout(
            () => this._ble.handleDisconnectError(BLEDataStoppedError),
            BLETimeout
        );
        */
    }

    /**
     * @param {number} pin - the pin to check touch state.
     * @return {number} - the latest value received for the touch pin states.
     * @private
     */
    _checkPinState (pin) {
        return this._sensors.touchPins[pin];
    }
}

/**
 * Enum for tilt sensor direction.
 * @readonly
 * @enum {string}
 */
const KoriTiltDirection = {
    FRONT: 'front',
    BACK: 'back',
    LEFT: 'left',
    RIGHT: 'right',
    ANY: 'any'
};

/**
 * Enum for kori gestures.
 * @readonly
 * @enum {string}
 */
const KoriGestures = {
    MOVED: 'moved',
    SHAKEN: 'shaken',
    JUMPED: 'jumped'
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
 * Enum for kori buttons.
 * @readonly
 * @enum {string}
 */
const KoriButtons = {
    A: 'A',
    B: 'B',
    ANY: 'any'
};

/**
 * Enum for kori pin states.
 * @readonly
 * @enum {string}
 */
const KoriPinState = {
    ON: 'on',
    OFF: 'off'
};

/**
 * Scratch 3.0 blocks to interact with a Kori peripheral.
 */
class Scratch3KoriBlocks {

    /**
     * @return {string} - the name of this extension.
     */
    static get EXTENSION_NAME () {
        return 'Assistant';
    }

    /**
     * @return {string} - the ID of this extension.
     */
    static get EXTENSION_ID () {
        return 'kori';
    }

    /**
     * @return {number} - the tilt sensor counts as "tilted" if its tilt angle meets or exceeds this threshold.
     */
    static get TILT_THRESHOLD () {
        return 15;
    }

    /**
     * @return {array} - text and values for each buttons menu element
     */
    get BUTTONS_MENU () {
        return [
            {
                text: 'A',
                value: KoriButtons.A
            },
            {
                text: 'B',
                value: KoriButtons.B
            },
            {
                text: formatMessage({
                    id: 'kori.buttonsMenu.any',
                    default: 'any',
                    description: 'label for "any" element in button picker for kori extension'
                }),
                value: KoriButtons.ANY
            }
        ];
    }

    /**
     * @return {array} - text and values for each events menu element
     */
    get EVENTS_MENU () {
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
     * @return {array} - text and values for each gestures menu element
     */
    get GESTURES_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'kori.gesturesMenu.moved',
                    default: 'moved',
                    description: 'label for moved gesture in gesture picker for kori extension'
                }),
                value: KoriGestures.MOVED
            },
            {
                text: formatMessage({
                    id: 'kori.gesturesMenu.shaken',
                    default: 'shaken',
                    description: 'label for shaken gesture in gesture picker for kori extension'
                }),
                value: KoriGestures.SHAKEN
            },
            {
                text: formatMessage({
                    id: 'kori.gesturesMenu.jumped',
                    default: 'jumped',
                    description: 'label for jumped gesture in gesture picker for kori extension'
                }),
                value: KoriGestures.JUMPED
            }
        ];
    }

    /**
     * @return {array} - text and values for each pin state menu element
     */
    get PIN_STATE_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'kori.pinStateMenu.on',
                    default: 'on',
                    description: 'label for on element in pin state picker for kori extension'
                }),
                value: KoriPinState.ON
            },
            {
                text: formatMessage({
                    id: 'kori.pinStateMenu.off',
                    default: 'off',
                    description: 'label for off element in pin state picker for kori extension'
                }),
                value: KoriPinState.OFF
            }
        ];
    }

    /**
     * @return {array} - text and values for each tilt direction menu element
     */
    get TILT_DIRECTION_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'kori.tiltDirectionMenu.front',
                    default: 'front',
                    description: 'label for front element in tilt direction picker for kori extension'
                }),
                value: KoriTiltDirection.FRONT
            },
            {
                text: formatMessage({
                    id: 'kori.tiltDirectionMenu.back',
                    default: 'back',
                    description: 'label for back element in tilt direction picker for kori extension'
                }),
                value: KoriTiltDirection.BACK
            },
            {
                text: formatMessage({
                    id: 'kori.tiltDirectionMenu.left',
                    default: 'left',
                    description: 'label for left element in tilt direction picker for kori extension'
                }),
                value: KoriTiltDirection.LEFT
            },
            {
                text: formatMessage({
                    id: 'kori.tiltDirectionMenu.right',
                    default: 'right',
                    description: 'label for right element in tilt direction picker for kori extension'
                }),
                value: KoriTiltDirection.RIGHT
            }
        ];
    }

    /**
     * @return {array} - text and values for each tilt direction (plus "any") menu element
     */
    get TILT_DIRECTION_ANY_MENU () {
        return [
            ...this.TILT_DIRECTION_MENU,
            {
                text: formatMessage({
                    id: 'kori.tiltDirectionMenu.any',
                    default: 'any',
                    description: 'label for any direction element in tilt direction picker for kori extension'
                }),
                value: KoriTiltDirection.ANY
            }
        ];
    }

    /**
     * Construct a set of Kori blocks.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
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
    getInfo () {
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
                    opcode: 'whenButtonPressed',
                    text: formatMessage({
                        id: 'kori.whenButtonPressed',
                        default: 'when [BTN] button pressed',
                        description: 'when the selected button on the kori is pressed'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        BTN: {
                            type: ArgumentType.STRING,
                            menu: 'buttons',
                            defaultValue: KoriButtons.A
                        }
                    }
                },
                {
                    opcode: 'isButtonPressed',
                    text: formatMessage({
                        id: 'kori.isButtonPressed',
                        default: '[BTN] button pressed?',
                        description: 'is the selected button on the kori pressed?'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        BTN: {
                            type: ArgumentType.STRING,
                            menu: 'buttons',
                            defaultValue: KoriButtons.A
                        }
                    }
                },
                '---',
                {
                    opcode: 'whenGesture',
                    text: formatMessage({
                        id: 'kori.whenGesture',
                        default: 'when [GESTURE]',
                        description: 'when the selected gesture is detected by the kori'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        GESTURE: {
                            type: ArgumentType.STRING,
                            menu: 'gestures',
                            defaultValue: KoriGestures.MOVED
                        }
                    }
                },
                */
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
                /*
                '---',
                {
                    opcode: 'displaySymbol',
                    text: formatMessage({
                        id: 'kori.displaySymbol',
                        default: 'display [MATRIX]',
                        description: 'display a pattern on the kori display'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        MATRIX: {
                            type: ArgumentType.MATRIX,
                            defaultValue: '0101010101100010101000100'
                        }
                    }
                },
                */
                {
                    opcode: 'displayText',
                    text: formatMessage({
                        id: 'kori.displayText',
                        default: 'display text [TEXT]',
                        description: 'display text on the kori display'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'kori.defaultTextToDisplay',
                                default: 'Hello!',
                                description: `default text to display.
                                IMPORTANT - the kori only supports letters a-z, A-Z.
                                Please substitute a default word in your language
                                that can be written with those characters,
                                substitute non-accented characters or leave it as "Hello!".
                                Check the kori site documentation for details`
                            })
                        }
                    }
                },
                {
                    opcode: 'displayClear',
                    text: formatMessage({
                        id: 'kori.clearDisplay',
                        default: 'clear display',
                        description: 'display nothing on the kori display'
                    }),
                    blockType: BlockType.COMMAND
                },
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
                }
                /*
                '---',
                {
                    opcode: 'whenTilted',
                    text: formatMessage({
                        id: 'kori.whenTilted',
                        default: 'when tilted [DIRECTION]',
                        description: 'when the kori is tilted in a direction'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        DIRECTION: {
                            type: ArgumentType.STRING,
                            menu: 'tiltDirectionAny',
                            defaultValue: KoriTiltDirection.ANY
                        }
                    }
                },
                {
                    opcode: 'isTilted',
                    text: formatMessage({
                        id: 'kori.isTilted',
                        default: 'tilted [DIRECTION]?',
                        description: 'is the kori is tilted in a direction?'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        DIRECTION: {
                            type: ArgumentType.STRING,
                            menu: 'tiltDirectionAny',
                            defaultValue: KoriTiltDirection.ANY
                        }
                    }
                },
                {
                    opcode: 'getTiltAngle',
                    text: formatMessage({
                        id: 'kori.tiltAngle',
                        default: 'tilt angle [DIRECTION]',
                        description: 'how much the kori is tilted in a direction'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        DIRECTION: {
                            type: ArgumentType.STRING,
                            menu: 'tiltDirection',
                            defaultValue: KoriTiltDirection.FRONT
                        }
                    }
                },
                '---',
                {
                    opcode: 'whenPinConnected',
                    text: formatMessage({
                        id: 'kori.whenPinConnected',
                        default: 'when pin [PIN] connected',
                        description: 'when the pin detects a connection to Earth/Ground'

                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        PIN: {
                            type: ArgumentType.STRING,
                            menu: 'touchPins',
                            defaultValue: '0'
                        }
                    }
                }
                    */
            ],
            menus: {
                buttons: {
                    acceptReporters: true,
                    items: this.BUTTONS_MENU
                },
                gestures: {
                    acceptReporters: true,
                    items: this.GESTURES_MENU
                },
                events: {
                    acceptReporters: true,
                    items: this.EVENTS_MENU
                },
                pinState: {
                    acceptReporters: true,
                    items: this.PIN_STATE_MENU
                },
                tiltDirection: {
                    acceptReporters: true,
                    items: this.TILT_DIRECTION_MENU
                },
                tiltDirectionAny: {
                    acceptReporters: true,
                    items: this.TILT_DIRECTION_ANY_MENU
                },
                touchPins: {
                    acceptReporters: true,
                    items: ['0', '1', '2']
                }
            }
        };
    }

    /**
     * Test whether the A or B button is pressed
     * @param {object} args - the block's arguments.
     * @return {boolean} - true if the button is pressed.
     */
    whenButtonPressed (args) {
        if (args.BTN === 'any') {
            return this._peripheral.buttonA | this._peripheral.buttonB;
        } else if (args.BTN === 'A') {
            return this._peripheral.buttonA;
        } else if (args.BTN === 'B') {
            return this._peripheral.buttonB;
        }
        return false;
    }

    /**
     * Test whether the A or B button is pressed
     * @param {object} args - the block's arguments.
     * @return {boolean} - true if the button is pressed.
     */
    isButtonPressed (args) {
        if (args.BTN === 'any') {
            return (this._peripheral.buttonA | this._peripheral.buttonB) !== 0;
        } else if (args.BTN === 'A') {
            return this._peripheral.buttonA !== 0;
        } else if (args.BTN === 'B') {
            return this._peripheral.buttonB !== 0;
        }
        return false;
    }

    /**
     * Test whether the kori is moving
     * @param {object} args - the block's arguments.
     * @return {boolean} - true if the kori is moving.
     */
    whenGesture (args) {
        const gesture = cast.toString(args.GESTURE);
        if (gesture === 'moved') {
            return (this._peripheral.gestureState >> 2) & 1;
        } else if (gesture === 'shaken') {
            return this._peripheral.gestureState & 1;
        } else if (gesture === 'jumped') {
            return (this._peripheral.gestureState >> 1) & 1;
        }
        return false;
    }

    /**
     * Test whether the kori is generating an event
     * @param {object} args - the block's arguments.
     * @returns {boolean} - true if the event is detected.
     */
    whenEvent (args) {
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

    /**
     * Display a predefined symbol on the 5x5 LED matrix.
     * @param {object} args - the block's arguments.
     * @return {Promise} - a Promise that resolves after a tick.
     */
    displaySymbol (args) {
        const symbol = cast.toString(args.MATRIX).replace(/\s/g, '');
        const reducer = (accumulator, c, index) => {
            const value = (c === '0') ? accumulator : accumulator + Math.pow(2, index);
            return value;
        };
        const hex = symbol.split('').reduce(reducer, 0);
        if (hex !== null) {
            this._peripheral.ledMatrixState[0] = hex & 0x1F;
            this._peripheral.ledMatrixState[1] = (hex >> 5) & 0x1F;
            this._peripheral.ledMatrixState[2] = (hex >> 10) & 0x1F;
            this._peripheral.ledMatrixState[3] = (hex >> 15) & 0x1F;
            this._peripheral.ledMatrixState[4] = (hex >> 20) & 0x1F;
            this._peripheral.displayMatrix(this._peripheral.ledMatrixState);
        }

        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, BLESendInterval);
        });
    }

    /**
     * Display text on the 5x5 LED matrix.
     * @param {object} args - the block's arguments.
     * @return {Promise} - a Promise that resolves after the text is done printing.
     * Note the limit is 19 characters
     * The print time is calculated by multiplying the number of horizontal pixels
     * by the default scroll delay of 120ms.
     * The number of horizontal pixels = 6px for each character in the string,
     * 1px before the string, and 5px after the string.
     */
    displayText (args) {
        // const text = String(args.TEXT).substring(0, 19);
        const text = args.TEXT;
        if (text.length > 0) this._peripheral.displayText(text);
        //const yieldDelay = 120 * ((6 * text.length) + 6);
        const yieldDelay = 0;

        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, yieldDelay);
        });
    }

    /**
     * Turn all 5x5 matrix LEDs off.
     * @return {Promise} - a Promise that resolves after a tick.
     */
    displayClear () {
        for (let i = 0; i < 5; i++) {
            this._peripheral.ledMatrixState[i] = 0;
        }
        this._peripheral.displayMatrix(this._peripheral.ledMatrixState);

        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, BLESendInterval);
        });
    }

    /**
     * 
     * @param {object} args 
     */
    ask (args) {
        const question = cast.toString(args.QUESTION);
        //const event = KoriEvents.WAKE;
        //this._peripheral.send(event, question);
        console.log(question);
    }

    /**
     * Test whether the tilt sensor is currently tilted.
     * @param {object} args - the block's arguments.
     * @property {TiltDirection} DIRECTION - the tilt direction to test (front, back, left, right, or any).
     * @return {boolean} - true if the tilt sensor is tilted past a threshold in the specified direction.
     */
    whenTilted (args) {
        return this._isTilted(args.DIRECTION);
    }

    /**
     * Test whether the tilt sensor is currently tilted.
     * @param {object} args - the block's arguments.
     * @property {TiltDirection} DIRECTION - the tilt direction to test (front, back, left, right, or any).
     * @return {boolean} - true if the tilt sensor is tilted past a threshold in the specified direction.
     */
    isTilted (args) {
        return this._isTilted(args.DIRECTION);
    }

    /**
     * @param {object} args - the block's arguments.
     * @property {TiltDirection} DIRECTION - the direction (front, back, left, right) to check.
     * @return {number} - the tilt sensor's angle in the specified direction.
     * Note that getTiltAngle(front) = -getTiltAngle(back) and getTiltAngle(left) = -getTiltAngle(right).
     */
    getTiltAngle (args) {
        return this._getTiltAngle(args.DIRECTION);
    }

    /**
     * Test whether the tilt sensor is currently tilted.
     * @param {TiltDirection} direction - the tilt direction to test (front, back, left, right, or any).
     * @return {boolean} - true if the tilt sensor is tilted past a threshold in the specified direction.
     * @private
     */
    _isTilted (direction) {
        switch (direction) {
        case KoriTiltDirection.ANY:
            return (Math.abs(this._peripheral.tiltX / 10) >= Scratch3KoriBlocks.TILT_THRESHOLD) ||
                (Math.abs(this._peripheral.tiltY / 10) >= Scratch3KoriBlocks.TILT_THRESHOLD);
        default:
            return this._getTiltAngle(direction) >= Scratch3KoriBlocks.TILT_THRESHOLD;
        }
    }

    /**
     * @param {TiltDirection} direction - the direction (front, back, left, right) to check.
     * @return {number} - the tilt sensor's angle in the specified direction.
     * Note that getTiltAngle(front) = -getTiltAngle(back) and getTiltAngle(left) = -getTiltAngle(right).
     * @private
     */
    _getTiltAngle (direction) {
        switch (direction) {
        case KoriTiltDirection.FRONT:
            return Math.round(this._peripheral.tiltY / -10);
        case KoriTiltDirection.BACK:
            return Math.round(this._peripheral.tiltY / 10);
        case KoriTiltDirection.LEFT:
            return Math.round(this._peripheral.tiltX / -10);
        case KoriTiltDirection.RIGHT:
            return Math.round(this._peripheral.tiltX / 10);
        default:
            log.warn(`Unknown tilt direction in _getTiltAngle: ${direction}`);
        }
    }

    /**
     * @param {object} args - the block's arguments.
     * @return {boolean} - the touch pin state.
     * @private
     */
    whenPinConnected (args) {
        const pin = parseInt(args.PIN, 10);
        if (isNaN(pin)) return;
        if (pin < 0 || pin > 2) return false;
        return this._peripheral._checkPinState(pin);
    }
}

module.exports = Scratch3KoriBlocks;
