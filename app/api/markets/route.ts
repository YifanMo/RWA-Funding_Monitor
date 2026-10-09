import {markets} from "@/lib/exchanges/registry";
export async function GET(){
 try{return Response.json(await markets(),{headers:{"Cache-Control":"private, no-store"}});}
 catch{return Response.json({error:"暂时无法读取交易所数据，请稍后重试"},{status:502});}
}
