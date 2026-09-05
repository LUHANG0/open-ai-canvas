import { Mesh, MeshStandardMaterial, Scene, type Material } from "three";

export function applyClaySceneMaterials(scene: Scene) {
    const clayMaterial = new MeshStandardMaterial({ color: "#d6d9dd", roughness: 0.88, metalness: 0 });
    const originals: Array<{ mesh: Mesh; material: Material | Material[] }> = [];
    scene.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh || mesh.userData.directorActor) return;
        // Grid 等辅助网格每帧访问自己的 uniforms，不能替换其 ShaderMaterial。
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.some((material) => "isShaderMaterial" in material && material.isShaderMaterial)) return;
        originals.push({ mesh, material: mesh.material });
        mesh.material = clayMaterial;
    });
    return () => {
        originals.forEach(({ mesh, material }) => {
            mesh.material = material;
        });
        clayMaterial.dispose();
    };
}
