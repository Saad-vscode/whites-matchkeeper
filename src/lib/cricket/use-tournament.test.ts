import {describe,expect,it,vi} from "vitest";
import {allRows} from "./use-tournament";
describe("tournament delivery pagination",()=>{
  it("loads beyond the backend row cap",async()=>{
    const data=Array.from({length:1203},(_,id)=>({id}));
    const page=vi.fn(async(from:number,to:number)=>({data:data.slice(from,to+1),error:null}));
    expect(await allRows(page)).toEqual(data);expect(page).toHaveBeenCalledTimes(3);
  });
  it("reports partial fetch failure rather than presenting incomplete scores",async()=>{
    const page=vi.fn(async(from:number)=>from===0 ? {data:Array(500).fill({id:1}),error:null} : {data:null,error:{message:"Connection lost"}});
    await expect(allRows(page)).rejects.toThrow("Connection lost");
  });
});
