import type { Env } from "./env";

export class ChatSessionDO {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // TODO: conversation FSM (task 3.5)
    return new Response("OK", { status: 200 });
  }
}

export { default } from "./worker";
