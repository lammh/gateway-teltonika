import Poetry from 'poetry';

import {
    Measurements
} from 'poetry/models';

import Planning from './planning.js';

module.exports = function saveToDB( measurements ) {

    Planning( measurements );

    measurements.forEach( measurement => {

        Measurements.update( {
                'device.id': measurement.device.id,
                timestamp: measurement.timestamp
            }, {
                $set: {
                    payload: measurement.payload,
                    measurements: measurement.measurements,
                    device: {
                        id: measurement.device.id
                    },
                    timestamp: measurement.timestamp
                }
            }, {
                upsert: true
            } )
            .then( a => {

                Poetry.log.silly( JSON.stringify( a ) );
                Poetry.emit( 'update:soapmeasurement', a );

            }, Poetry.log.error );

    } );

};
