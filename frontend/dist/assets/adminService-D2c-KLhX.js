import{c as d,h as i}from"./index-BaFLiVXE.js";/**
 * @license lucide-react v0.503.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const n=[["path",{d:"M7 18v-6a5 5 0 1 1 10 0v6",key:"pcx96s"}],["path",{d:"M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z",key:"1b4s83"}],["path",{d:"M21 12h1",key:"jtio3y"}],["path",{d:"M18.5 4.5 18 5",key:"g5sp9y"}],["path",{d:"M2 12h1",key:"1uaihz"}],["path",{d:"M12 2v1",key:"11qlp1"}],["path",{d:"m4.929 4.929.707.707",key:"1i51kw"}],["path",{d:"M12 12v6",key:"3ahymv"}]],c=d("siren",n),o={async listUsers(t=!0){const{data:e}=await i.get("/admin/users",{params:{include_inactive:t}});return e},async updateUser(t,e){const{data:a}=await i.patch(`/admin/users/${t}`,e);return a},async setUserPassword(t,e){const{data:a}=await i.post(`/admin/users/${t}/set-password`,e);return a},async listAudit(t){const{data:e}=await i.get("/admin/audit",{params:{limit:(t==null?void 0:t.limit)??100,action:(t==null?void 0:t.action)||void 0,user_id:(t==null?void 0:t.user_id)||void 0}});return e}};export{c as S,o as a};
