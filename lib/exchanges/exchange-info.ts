/** Add the display entry here and register an ExchangeAdapter in registry.ts. */
export const exchangeInfo=[
 {id:"hyperliquid",venue:"Hyperliquid",initial:"H"},
 {id:"binance",venue:"Binance",initial:"B"},
 {id:"aster",venue:"Aster",initial:"A"},
 {id:"ondo",venue:"Ondo Perps",initial:"O"},
];

/** Keep display names with spaces independent of CSS classes. */
export function venueClassName(venue:string):string {
 return exchangeInfo.find(exchange=>exchange.venue===venue)?.id??venue.toLowerCase().replace(/[^a-z0-9_-]+/g,"-");
}
