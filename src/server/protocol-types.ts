type RoomRequest = {
  action?:string; code?:string; lifecycleVersion?:number;
  hostToken?:string; hostAccessToken?:string; id?:string; playerToken?:string;
  spectatorToken?:string; target?:string;
  [field:string]:any;
};
type ErrorResponse = {error:string};
type PublicRoomResponse = {
  code:string; phase:string; round:number; lifecycleVersion:number;
  matchId:string|null; players:any[]; me?:any;
  [field:string]:any;
};
type RouteContext = {
  body:RoomRequest; action:string; ip:string; now:number; started:number;
};
type RoomRouteContext = RouteContext & {code:string;room:any;players:any[];me:any;host:boolean;authenticatedSpectator:any};
