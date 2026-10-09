import type {Plugin} from "vite";
import {fetch as nodeFetch,EnvHttpProxyAgent} from "undici";
/** Dev-only bridge: Miniflare cannot use the desktop's HTTP proxy for outbound fetch. */
export function publicFeedPreview():Plugin {
 const dispatcher=new EnvHttpProxyAgent();
 return {name:"public-feed-preview",apply:"serve",configureServer(server){
  server.middlewares.use("/__dev_public_feed",async(req,res)=>{
   try{
    const target=new URL(new URL(req.url??"/","http://localhost").searchParams.get("url")??"");
    const allowed=target.protocol==="https:"&&!target.username&&!target.password&&!target.port&&(
     target.hostname==="api.hyperliquid.xyz"&&target.pathname==="/info"||
     ["fapi.binance.com","fapi.asterdex.com"].includes(target.hostname)&&/^\/fapi\/v1\/(exchangeInfo|premiumIndex|fundingInfo|fundingRate|ticker\/24hr)$/.test(target.pathname));
    if(!allowed){res.statusCode=400;res.end("Invalid public feed");return;}
    let body="";for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error("Request too large");}
    const result=await nodeFetch(target,{dispatcher,method:req.method??"GET",headers:{"Content-Type":"application/json"},...(body?{body}:{}),signal:AbortSignal.timeout(20000)});
    res.statusCode=result.status;res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.end(await result.text());
   }catch{res.statusCode=502;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:"Preview feed unavailable"}));}
  });
 }};
}
