(function(){"use strict";self.addEventListener("message",async s=>{const{action:e,symbols:t,_thresholds:o}=s.data;e==="start"&&setInterval(()=>{console.log("[Worker] Checking prices for:",t),self.postMessage({type:"CHECK_COMPLETE",status:"checked",_thresholds:o})},6e4)})})();
//# sourceMappingURL=priceAlertWorker-CcvmCsde.js.map
