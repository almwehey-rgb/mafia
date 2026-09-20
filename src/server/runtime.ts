import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { AsyncLocalStorage } from "node:async_hooks";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Expose-Headers": "X-Request-Id,Server-Timing",
};
const requestDatabase = new AsyncLocalStorage<{headers: Record<string,string>; client?: any; plan?: TransitionPlan; requestId?:string; started?:number; action?:string; observation?:any}>();
