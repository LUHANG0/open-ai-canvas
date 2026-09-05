import { expect, test } from "bun:test";
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, ShaderMaterial, Vector3 } from "three";
import { applyClaySceneMaterials } from "../src/lib/canvas/director/director-clay-materials";

test("白膜替换实体材质，保留 Grid uniforms 并完整恢复", () => {
    const scene = new Scene();
    const original = new MeshStandardMaterial({ color: "red" });
    const box = new Mesh(new BoxGeometry(), original);
    const gridMaterial = new ShaderMaterial({ uniforms: { worldCamProjPosition: { value: new Vector3() } } });
    const grid = new Mesh(new BoxGeometry(), gridMaterial);
    const actor = new Mesh(new BoxGeometry(), original);
    actor.userData.directorActor = true;
    scene.add(box, grid, actor);
    const restore = applyClaySceneMaterials(scene);
    expect(box.material).not.toBe(original);
    expect(grid.material).toBe(gridMaterial);
    expect(grid.material.uniforms.worldCamProjPosition.value).toBeInstanceOf(Vector3);
    expect(actor.material).toBe(original);
    restore();
    expect(box.material).toBe(original);
    expect(grid.material).toBe(gridMaterial);
});
