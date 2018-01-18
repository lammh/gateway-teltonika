import Poetry from 'poetry';

import Measurement from './measurement';
import SaveToDB from './saveToDB';

module.exports = function handler( socket ) {

    console.log( 'New connection' );

    new Measurement(
        socket,
        new Date(),
        SaveToDB
    );

};
