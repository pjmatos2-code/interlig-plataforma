/**
 * Reduz a foto no aparelho antes de enviar (máx 1280px, JPEG 82%). Foto de
 * galeria de celular tem 3–12 MB e a Vercel recusa requisição acima de
 * 4,5 MB — sem reduzir, o envio quebra só no celular. Se o navegador não
 * conseguir decodificar a imagem, devolve o arquivo original.
 */
export async function reduzirFoto(arquivo: File, maxLado = 1280): Promise<File> {
  try {
    const img = await createImageBitmap(arquivo);
    const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : arquivo;
  } catch {
    return arquivo;
  }
}
