import {contractHistory} from "@/lib/exchanges/registry";
import {message} from "@/lib/exchanges/http";
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;const id=params.get("id")??"";const days=Number(params.get("days")??"7");
 if((id.length>128||!/^[a-z][a-z0-9-]*:[A-Za-z0-9:_-]+$/.test(id))||![1,7,30].includes(days))return Response.json({error:"请选择有效的合约和时间范围"},{status:400});
 try{return Response.json(await contractHistory(id,days as 1|7|30),{headers:{"Cache-Control":"private, no-store"}});}
 catch(error){return Response.json({error:message(error)},{status:502});}
}
