import Poetry from 'poetry';

const PRIORITY = [ 'low', 'high', 'panic', 'security' ];
const EVENT = require( './events.json' );


module.exports = function ( payload, deviceID ) {

    let measurements = []; // Output

    function consumePayload( bytes, toInt ) {

        let content = payload.slice( 0, bytes * 2 );
        payload = payload.slice( bytes * 2 );

        if ( toInt ) return parseInt( content, 16 );
        else return content;

    }

    // Iterate each record in the payload
    while ( payload.length ) {

        // Remove the 4bytes 0 separator
        if ( payload.startsWith( '00000000' ) )
            consumePayload( 4 );

        // Get the packet, crc, and remove them from payload
        let packetLength = consumePayload( 4, true ),
            packet = consumePayload( packetLength ),
            packetRaw = packet,
            crc = consumePayload( 4 );

        function consumePacket( bytes, toInt ) {

            let content = packet.slice( 0, bytes * 2 );
            packet = packet.slice( bytes * 2 );

            if ( toInt ) return parseInt( content, 16 );
            else return content;

        }

        // TODO Check CRC

        // Check codec
        let codec = consumePacket( 1 );
        if ( codec != '08' )
            return Poetry.log.warn( `Unknown codec : ${codec}` );

        consumePacket( 1 );

        while ( packet.length > 2 ) {

            let timestamp = consumePacket( 8, true ),
                priority = consumePacket( 1, true ),
                gps = {
                    lng: gpsDecode( consumePacket( 4, true ) ),
                    lat: gpsDecode( consumePacket( 4, true ) ),
                    alt: consumePacket( 2, true ),
                    ang: consumePacket( 2, true ),
                    sat: consumePacket( 1, true ),
                    speed: consumePacket( 2, true )
                },
                events = {
                    id: consumePacket( 1 ),
                    count: consumePacket( 1 )
                };

            let measurement = {
                device: {
                    id: deviceID
                },
                timestamp: new Date( timestamp ),
                payload: packetRaw,
                measurements: [ {
                    type: "priority",
                    value: PRIORITY[ priority ]
                }, {
                    type: "position",
                    id: "gps",
                    value: gps
                }, {
                    type: "isValid",
                    value: !( !gps.speed && !gps.ang && !gps.sat )
                } ]
            };

            [ 1, 2, 4, 8 ].forEach( bytes => {

                let count = consumePacket( 1, true );

                for ( let i = 0; i < count; i++ ) {
                    let id = consumePacket( 1, true ),
                        value = consumePacket( bytes, true );

                    if ( !EVENT[ id ] ) continue;
                    if ( EVENT[ id ].isBoolean ) value = !!value;
                    if ( EVENT[ id ].enum ) value = EVENT[ id ].enum[ value ];

                    let event = {
                        type: EVENT[ id ].type,
                        value: value
                    };

                    if ( EVENT[ id ].unit ) event.unit = EVENT[ id ].unit;

                    measurement.measurements.push( event );
                }

            } );

            measurements.push( measurement );

        }

    }

    // Send back the decoded measurements
    return measurements;

};


function gpsDecode( value ) {

    // Get first bit to check sign
    let sign = ( value >> 31 ) ? -1 : 1;

    // Remove first bit
    let absolute = value & 0x7fffffff;
    absolute /= 10000000;

    return absolute * sign;

}
