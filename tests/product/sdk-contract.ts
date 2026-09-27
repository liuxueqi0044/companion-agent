import type {Client,InterfaceSource,Goal,Workflow,Reply,Turn} from '../../apps/desktop/personal-space/interface-sdk.js';

// Compile the actual public SDK boundary, including negative calls that must stay invalid.
export async function checkClient(client:Client,source:InterfaceSource,goal:Goal,workflow:Workflow) {
  const reply:Reply<Turn>=await client.conversation.get({turnId:'sample'});
  if(reply.ok)reply.result?.reply?.toUpperCase();
  await client.conversation.send({command_id:'c',conversation_id:'t',text:'hello',temporary:true});
  await client.host.configureWindow({width:800,transparent:true});
  await client.state.write({expectedRevision:1,value:{nested:{valid:[1,true,null]}}});
  // @ts-expect-error A model proposal cannot add a scope outside the public contract.
  source.scopes.push('credentials');
  // @ts-expect-error UI payloads cannot use a string as the temporary privacy switch.
  await client.conversation.send({command_id:'c',conversation_id:'t',text:'hi',temporary:'false'});
  // @ts-expect-error Cancellation requires the exact run binding.
  await client.tasks.stop({turnId:'t'});
  return {goalPhase:goal.phase,steps:workflow.steps.length};
}
