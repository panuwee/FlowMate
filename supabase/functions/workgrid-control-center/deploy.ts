// Explicit Edge Runtime entrypoint. Tests import index.ts without starting a server.
import {handleRequest, defaults} from './index.ts';
declare const Deno:{serve(h:(request:Request)=>Promise<Response>):void};
Deno.serve(request=>handleRequest(request,defaults()));
