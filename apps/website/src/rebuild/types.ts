export type SceneId = 'hero' | 'gallery' | 'community';
export type Quality = 'full' | 'balanced' | 'static';
export type Viewport = { width:number; height:number; dpr:number; layout:'desktop'|'tablet'|'mobile' };
export type Point = Readonly<{x:number;y:number}>;
export type Quad = readonly [Point,Point,Point,Point];
export type Crop = {x:number;y:number;w:number;h:number};
export type SceneFrame = {
  progress:number; enter:number; exit:number; opacity:number; active:boolean;
  ambientTime:number; ambientDeltaSeconds:number; reducedMotion:boolean; quality:Quality;
  pointer:{x:number;y:number}; handoffHiddenIds:readonly string[];
};
export type HandoffAnchor = {
  instanceId:string; assetId:string; assetVersion:string; quad:Quad;
  uv:Crop; appearanceId:string; occlusionGroup:string;
  src:string; width:number; height:number; borderRadius?:number;
  /** Optional scene-owned content to clone into the bridge; never mutate this node. */
  element?:HTMLElement;
};
export interface SceneModule {
  ready:Promise<'ready'|'fallback'>;
  resize(viewport:Viewport):void;
  update(frame:SceneFrame):void;
  sampleHandoff?(instanceId:string,frame:SceneFrame):HandoffAnchor|undefined;
  dispose():void;
}
export type Work = {id:string;title:string;description:string;src:string;category:string;skills:readonly string[];crop?:Crop};
