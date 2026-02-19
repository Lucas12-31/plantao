import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, updateDoc, doc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const listaEl = document.getElementById('lista-notificacoes');
const badgeEl = document.getElementById('badge-contador');

// ======================================================
// 1. O ROBÔ (VERIFICADOR DE REGRAS)
// ======================================================
async function verificarRegrasDeNotificacao() {
    // Busca leads ativos
    const leadsSnap = await getDocs(collection(db, "leads"));
    
    // Busca notificações já existentes para não duplicar
    const notifSnap = await getDocs(collection(db, "notificacoes"));
    const chavesExistentes = [];
    notifSnap.forEach(d => {
        const dados = d.data();
        chavesExistentes.push(`${dados.lead_id}_${dados.tipo_alerta}`);
    });

    const agora = new Date();

    leadsSnap.forEach(async (d) => {
        const lead = d.data();
        const leadId = d.id;

        // Ignora se não tem data ou se já acabou
        if (!lead.data_status) return;
        if (["Finalizado", "Lead Inválido", "Declinado"].includes(lead.status)) return;

        const dataStatus = new Date(lead.data_status);
        const diffMs = agora - dataStatus; 
        const diffHoras = diffMs / (1000 * 60 * 60);
        const diffDias = diffMs / (1000 * 60 * 60 * 24);

        let titulo = "";
        let mensagem = "";
        let tipoAlerta = "";

        // --- REGRA 1: Distribuído (24 HORAS depois) ---
        if (lead.status === "Distribuído" && diffHoras >= 24) {
            titulo = "⚠️ Cobrar Corretor";
            mensagem = `Passaram 24h! Falar com o corretor sobre <b>${lead.cliente}</b>`;
            tipoAlerta = "24h_distribuido";
        }

        // --- REGRA 2: Retornar depois (7 DIAS depois) ---
        else if (lead.status === "Retornar depois" && diffDias >= 7) {
            titulo = "📞 Retornar Contato";
            mensagem = `Passou 1 semana. Retornar para <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_retornar";
        }

        // --- REGRA 3: Em negociação (7 DIAS depois) ---
        else if (lead.status === "Em negociação" && diffDias >= 7) {
            titulo = "👀 Acompanhamento";
            mensagem = `Lead parado há 1 semana: <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_negociacao";
        }

        // --- REGRA 4: Proposta Gerada (7 DIAS depois) ---
        else if (lead.status === "Proposta Gerada" && diffDias >= 7) {
            titulo = "💼 Suporte Comercial";
            mensagem = `Verificar proposta de <b>${lead.cliente}</b> com Suporte.`;
            tipoAlerta = "7d_proposta";
        }

        // DISPARAR NOTIFICAÇÃO
        if (titulo && !chavesExistentes.includes(`${leadId}_${tipoAlerta}`)) {
            await addDoc(collection(db, "notificacoes"), {
                lead_id: leadId,
                titulo: titulo,
                mensagem: mensagem,
                tipo_alerta: tipoAlerta, 
                lida: false,
                timestamp: new Date().toISOString()
            });
            // Adiciona na lista temporária para não duplicar no loop atual
            chavesExistentes.push(`${leadId}_${tipoAlerta}`);
        }
    });
}

// ======================================================
// 2. A UI (VISUAL E INTERAÇÃO)
// ======================================================
const q = query(collection(db, "notificacoes"), where("lida", "==", false), orderBy("timestamp", "desc"));

onSnapshot(q, (snapshot) => {
    const qtd = snapshot.size;

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
                        <p class="mb-1 text-wrap" style="font-size:0.8rem; line-height: 1.2;">
                            ${n.mensagem}
                        </p>
                    </a>
                </li>
            `;
        });
    }
    
    if(listaEl) listaEl.innerHTML = html;
});

// Função para marcar como lida
window.lerNotificacao = async (id, event) => {
    if(event) event.preventDefault();
    try {
        await updateDoc(doc(db, "notificacoes", id), { lida: true });
    } catch (error) {
        console.error(error);
    }
};

// Roda verificação inicial e depois a cada 10 minutos (para não pesar o sistema)
verificarRegrasDeNotificacao();
setInterval(verificarRegrasDeNotificacao, 600000);
