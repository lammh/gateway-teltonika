import Net from 'net';
import Poetry from 'poetry';

import Handler from './handler';


const PORT = 8765;

Net.createServer( Handler )
    .listen( PORT );

Poetry.log.info( `Server listening on port ${PORT}` );
