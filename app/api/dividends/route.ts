import {readBinanceDividends} from "@/lib/dividends/binance";
export async function GET(){return Response.json(await readBinanceDividends(),{headers:{"Cache-Control":"private, no-store"}});}
