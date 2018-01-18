import Poetry from 'poetry';
import Decode from './decode';

module.exports = class Measurement {

    /**
     * constructor
     * Initiate and bind the connection to a new measurement
     * @param {net.Socket} socket Socket of the connection
     * @constructor
     */
    constructor( socket, timestamp, cb ) {

        // Set default properties
        this._socket = socket;
        this._cb = cb;
        this.timestamp = timestamp;

        // Bind the handlers
        socket.on( 'data', ( chunck ) => this.parse( chunck ) );
        socket.on( 'error', Poetry.log.error );

    }

    parse( chunck ) {

        // No deviceID yet : first chunck defines it
        if ( !this.device )
            return this.parse_id( chunck );

        // Otherwise parse payload
        this.parse_payload( chunck );

    }

    parse_id( chunck ) {

        // Decode into UTF8
        this.device = chunck
            .toString( 'utf-8' )
            .slice( 2 );
        Poetry.log.info( `Receiving measurement from ${this.device}` );

        // Send ACK to the device (constant 0x01)
        this.sendACK( 0x01 );

    }

    parse_payload( chunck ) {

        // Decode into hexa string
        this.payload = chunck.toString( 'hex' );

        // Decode content
        let decoded = Decode( this.payload, this.device ) || [];

        // Send ACK : decoded data counter in 4bytes buffer
        let buffer = new Buffer( 4 /* bytes long */ );
        buffer.writeInt32LE( decoded.length );
        this.sendACK( buffer );
        this._socket.end();

        // If no callback rise a warning
        if ( typeof this._cb != 'function' )
            return Poetry.log.warn( 'No callback set', this._cb );

        // Fire the CB
        this._cb( decoded );


    }

    sendACK( data ) {

        // Transform as an array if only 1 byte received
        if ( typeof data == 'number' )
            data = [ data ];

        // Transform to Buffer if not already one
        if ( !Buffer.isBuffer( data ) )
            data = new Buffer( data );

        // Write to the socket
        this._socket.write( data );

    }

};
