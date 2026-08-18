import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

const DATA_FILE = path.join(__dirname, "data.json");

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { products: {}, invoices: [] };
  }
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

const EXTRACTION_PROMPT = `Você é um sistema de extração de dados de notas fiscais (NF-e) brasileiras a partir de imagens ou arquivos PDF.
Analise a imagem ou o PDF da nota fiscal e extraia os dados. Responda APENAS com um objeto JSON válido, sem markdown, sem texto antes ou depois, no formato exato:
{"fornecedor":"nome do fornecedor ou emitente","data":"data de emissão se visível, senão string vazia","itens":[{"produto":"nome do produto","quantidade":numero,"valor_unitario":numero,"valor_total":numero,"unidades_por_embalagem":numero,"valor_unidade":numero}],"valor_total_nota":numero,"observacoes":"qualquer ressalva sobre itens ilegíveis ou ambíguos, ou string vazia"}
Preste atenção especial à descrição de cada produto: se ela indicar quantidade por embalagem, caixa ou pacote (ex.: "C/30", "CX 12", "PCT C/24", "C/6 UN", "12X1UN"), extraia esse número em "unidades_por_embalagem". Se a descrição não indicar essa informação, use 1. Calcule "valor_unidade" dividindo "valor_unitario" pelo número de "unidades_por_embalagem" (se unidades_por_embalagem for 1, valor_unidade é igual a valor_unitario).
Use ponto decimal nos números (nunca vírgula). Se algum campo não estiver visível na imagem, use 0 para números ou string vazia para texto. Não invente itens que não estejam na imagem.`;

app.get("/api/data", async (req, res) => {
  const data = await readData();
  res.json(data);
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "Arquivo não enviado" });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada no servidor. Adicione essa variável de ambiente em Railway." });
    }

    const isPdf = mimeType === "application/pdf";
    const fileBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
      : { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: imageBase64 } };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              fileBlock,
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "Erro na chamada à API da Anthropic", detail: errText });
    }

    const result = await response.json();
    const textBlock = (result.content || []).find((b) => b.type === "text");
    if (!textBlock) return res.status(502).json({ error: "Resposta da IA sem conteúdo de texto" });

    const clean = textBlock.text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao processar a imagem", detail: String(err.message || err) });
  }
});

app.post("/api/confirm", async (req, res) => {
  try {
    const { fornecedor, data: dataNota, itens } = req.body;
    if (!Array.isArray(itens)) return res.status(400).json({ error: "Lista de itens inválida" });

    const store = await readData();
    itens.forEach((it) => {
      const key = (it.produto || "").trim().toLowerCase();
      if (!key) return;
      const existing = store.products[key];
      const unidadesPorEmbalagem = Number(it.unidades_por_embalagem) || 1;
      const valorUnitario = Number(it.valor_unitario) || 0;
      const valorUnidade = Number(it.valor_unidade) || (valorUnitario / unidadesPorEmbalagem) || 0;
      store.products[key] = {
        name: it.produto,
        unit: "un",
        stock: (existing?.stock || 0) + (Number(it.quantidade) || 0),
        lastCost: valorUnitario,
        lastUnitValue: valorUnidade,
        lastUpdated: new Date().toLocaleString("pt-BR"),
      };
    });

    const invoice = {
      id: "inv_" + Date.now(),
      fornecedor: fornecedor || "Fornecedor não identificado",
      data: dataNota || "",
      itens,
      valorTotal: itens.reduce((a, i) => a + (Number(i.valor_total) || 0), 0),
      processedAt: new Date().toLocaleString("pt-BR"),
    };
    store.invoices.unshift(invoice);

    await writeData(store);
    res.json({ ok: true, data: store });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao salvar os dados", detail: String(err.message || err) });
  }
});

app.post("/api/clear", async (req, res) => {
  await writeData({ products: {}, invoices: [] });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Estoque em Dia rodando na porta " + PORT));
