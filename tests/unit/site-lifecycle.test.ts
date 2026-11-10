import {expect,it} from 'vitest';
import {inspectTrackerMarkup} from '../../src/server/site-lifecycle.js';
it('recognizes both official tracker builds and preserves exact site and API-origin matching',()=>{
 const inspect=(html:string)=>inspectTrackerMarkup(html,'https://blog.example.test/','mine','https://stats.example.test');
 for(const name of ['tracker.js','tracker-min.js','tracker.min.js'])expect(inspect(`<script src="https://stats.example.test/${name}?v=2" data-site-id="mine"></script>`)).toMatchObject({found:true,matchingScripts:1});
 for(const html of ['<script src="https://stats.example.test/not-tracker.js" data-site-id="mine"></script>','<script src="https://evil.test/tracker.js" data-site-id="mine"></script>','<script src="https://stats.example.test/tracker.js" data-site-id="other"></script>','<script src="https://stats.example.test/tracker.js" data-api-host="https://evil.test" data-site-id="mine"></script>'])expect(inspect(html).found).toBe(false);
});
