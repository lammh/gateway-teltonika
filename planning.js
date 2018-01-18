import Poetry from 'poetry';
import Async from 'async';

import {
    Plannings,
    Devices,
    ObjectId
} from 'poetry/models';

module.exports = function planning( measurements ) {

    // Order measurements
    measurements = measurements.sort( ( a, b ) => a.timestamp - b.timestamp );

    // Loop into the measurements
    Async.eachSeries( measurements, ( measurement, next ) => {

        let state,
            odometer,
            position;

        const API_KEY = process.env.mapzen_key;
        const FIELDS = [ 'label', 'housenumber', 'region', 'postalcode' ];

        // Retrieve the state, position, and odometer values
        measurement.measurements.forEach( data => {
            switch ( data.type ) {
                case 'trip':
                    if ( ~[
                            'start',
                            'stop'
                        ].indexOf( data.value ) )
                        state = data.value;
                    break;
                case 'position':
                    position = data.value;
                    break;
                case 'odometer value':
                    odometer = data.value;
                    break;
            }
        } );

        // Don't go further if there's no trip
        if ( !state ) return next();

        // Define planning entry type
        let planningType = ( state == 'start' ) ? 'trip' : 'stay';

        Async.parallel( {

            // Get the device
            device( cb ) {
                Devices.findOne( {
                        _id: measurement.device.id
                    } )
                    .then( r => cb( null, r ), cb );
            },

            // Check if it is already processed in the past
            exists( cb ) {
                Plannings.findOne( {
                        mainAssetType: 'devices',
                        mainAsset: measurement.device.id,
                        planningType: planningType,
                        plannedFrom: measurement.timestamp
                    } )
                    .then( r => cb( null, r ), cb );
            }

        }, ( err, res ) => {

            // If already existing, give up
            if ( err || res.exists ) return next();

            // If the device not found or not owned, abort
            if ( !res.device || !res.device.team ) return next();

            request( `https://search.mapzen.com/v1/reverse?point.lat=${position.lat}&point.lon=${position.lng}&size=1&api_key=${API_KEY}`,
                    ( error, response, body ) => {

                        if ( body && !error ) {

                            try {

                                body = JSON.parse( body );
                                values = body.features[ 0 ].properties;
                                FIELDS.forEach( field => {
                                    position[ field ] = values[ field ];

                                } );
                                Poetry.log.silly( "fields", fields );

                            } catch ( e ) {}
                        }
                    } )
                .then( () => {
                    // Close the previous planning entry
                    Plannings.update( {

                            mainAssetType: 'devices',
                            mainAsset: res.device._id,
                            planningType: opposite( planningType ),
                            plannedFrom: {
                                $lt: measurement.timestamp
                            },
                            plannedTo: {
                                $exists: false
                            }

                        }, {
                            $set: {

                                plannedTo: measurement.timestamp,
                                odometer: odometer,
                                'position.stop': position,

                            },
                            $inc: {

                                duration: ( measurement.timestamp )
                                    .getTime()

                            }
                        }, {
                            multi: true
                        } )
                        .then( closed => {

                            if ( closed && closed.length !== 0 )
                                Poetry.log.silly( 'Closed', JSON.stringify( closed ) );

                            // Opening a new planning entry
                            Plannings.insert( {

                                    mainAssetType: 'devices',
                                    mainAsset: res.device._id,
                                    planningType: planningType,
                                    plannedFrom: measurement.timestamp,

                                    team: res.device.team,
                                    position: {
                                        start: position
                                    },

                                    duration: -( measurement.timestamp )
                                        .getTime()
                                } )
                                .then( opened => {
                                    Poetry.log.silly( 'Opened', JSON.stringify( opened ) );
                                    next();

                                }, next );
                        }, next );
                } );
        } );

    }, () => Poetry.log.info( 'done' ) );
};

function opposite( state ) {
    return ( state == 'trip' ) ?
        'stay' : 'trip';
}
