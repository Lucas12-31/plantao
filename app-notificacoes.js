import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, updateDoc, doc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const listaEl = document.getElementById('lista-notificacoes');
const badgeEl = document.getElementById('badge-contador');

// ======================================================
// 1. O ROBÔ (VERSÃO DEBUG / TESTE)
// ======================================================
async function verificarRegrasDeNotificacao() {
    console.log("🤖 1. Robô iniciou a verificação...");

    const leadsSnap = await getDocs(collection(db, "leads"));
    const notifSnap = await getDocs(collection(db, "notificacoes"));
    
    // Lista de notificações que já existem
    const chavesExistentes = [];
    notifSnap.forEach(d => {
        const dados = d.data();
        chavesExistentes.push(`${dados.lead_id}_${dados.tipo_alerta}`);
    });

    console.log(`🤖 2. Encontrei ${leadsSnap.size} leads para analisar.`);

    const agora = new Date();

    leadsSnap.forEach(async (d) => {
        const lead = d.data();
        const leadId = d.id;

        // VALIDAÇÃO 1: TEM STATUS?
        if (["Finalizado", "Lead Inválido", "Declinado"].includes(lead.status)) return;

        // VALIDAÇÃO 2: TEM DATA?
        if (!lead.data_status) {
            console.warn(`⚠️ Lead ${lead.cliente} não tem 'data_status'. Altere o status dele para corrigir.`);
            return;
        }

        const dataStatus = new Date(lead.data_status);
        const diffMs = agora - dataStatus;
        const diffHoras = diffMs / (1000 * 60 * 60);
        const diffDias = diffMs / (1000 * 60 * 60 * 24);

        // LOG DO CÁLCULO (Para você ver se está funcionando)
        // Se for o lead que você está testando, vai aparecer aqui
        if (lead.status === "Distribuído") {
            console.log(`🔎 Analisando ${lead.cliente}: Status há ${diffHoras.toFixed(2)} horas.`);
        }

        let titulo = "";
        let mensagem = "";
        let tipoAlerta = "";

        // --- REGRA DE TESTE (MUDEI PARA 0 HORAS AQUI) ---
        // Se quiser testar 1 minuto, use 0.01
        if (lead.status === "Distribuído" && diffHoras >= 24) { 
            titulo = "⚠️ Cobrar Corretor";
            mensagem = `Falar com o corretor sobre Cliente <b>${lead.cliente}</b>`;
            tipoAlerta = "24h_distribuido";
        }

        // Outras regras originais...
        else if (lead.status === "Retornar depois" && diffDias >= 7) {
            titulo = "📞 Retornar Contato";
            mensagem = `Retornar contato cliente <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_retornar";
        }
        else if (lead.status === "Em negociação" && diffDias >= 7) {
            titulo = "👀 Acompanhamento";
            mensagem = `Falar com o corretor sobre Cliente <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_negociacao";
        }
        else if (lead.status === "Proposta Gerada" && diffDias >= 7) {
            titulo = "💼 Suporte Comercial";
            mensagem = `Falar com o Suporte sobre Proposta <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_proposta";
        }

        // DISPARAR
        if (titulo) {
            // Verifica se já notificou antes
            if (!chavesExistentes.includes(`${leadId}_${tipoAlerta}`)) {
                console.log(`✅ CRIANDO NOTIFICAÇÃO PARA: ${lead.cliente}`);
                
                await addDoc(collection(db, "notificacoes"), {
                    lead_id: leadId,
                    titulo: titulo,
                    mensagem: mensagem,
                    tipo_alerta: tipoAlerta,
                    lida: false,
                    timestamp: new Date().toISOString()
                });
                chavesExistentes.push(`${leadId}_${tipoAlerta}`); // Evita duplicar no mesmo loop
            } else {
                console.log(`ℹ️ Notificação já existe para: ${lead.cliente}`);
            }
        }
    });
}

// ======================================================
// 2. A UI (VISUAL)
// ======================================================
const q = query(collection(db, "notificacoes"), where("lida", "==", false), orderBy("timestamp", "desc"));

onSnapshot(q, (snapshot) => {
    const qtd = snapshot.size;
    console.log(`🔔 Atualizando sino: ${qtd} notificações não lidas.`);

    if (qtd > 0) {
        badgeEl.textContent = qtd;
        badgeEl.classList.remove('d-none');
    } else {
        badgeEl.classList.add('d-none');
    }

    let html = '';
    if (qtd === 0) {
        html = '<li><span class="dropdown-item text-muted small text-center py-3">Tudo limpo! 🍃</span></li>';
    } else {
        snapshot.forEach(doc => {
            const n = doc.data();
            const dataN = new Date(n.timestamp).toLocaleDateString('pt-BR');
            html += `
                <li>
                    <a class="dropdown-item p-2 border-bottom" href="#" onclick="lerNotificacao('${doc.id}', event)">
                        <div class="d-flex w-100 justify-content-between">
                            <strong class="mb-1 text-primary" style="font-size:0.85rem">${n.titulo}</strong>
                            <small class="text-muted" style="font-size:0.7rem">${dataN}</small>
                        </div>
                        <p class="mb-1 text-wrap" style="font-size:0.8rem; line-height: 1.2;">${n.mensagem}</p>
                    </a>
                </li>`;
        });
    }
    if(listaEl) listaEl.innerHTML = html;
});

window.lerNotificacao = async (id, event) => {
    if(event) event.preventDefault();
    try {
        await updateDoc(doc(db, "notificacoes", id), { lida: true });
    } catch (error) { console.error(error); }
};

// Roda imediatamente
verificarRegrasDeNotificacao();
// E repete a cada 60s
setInterval(verificarRegrasDeNotificacao, 60000);
