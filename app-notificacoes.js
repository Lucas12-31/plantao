import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, updateDoc, doc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const listaEl = document.getElementById('lista-notificacoes');
const badgeEl = document.getElementById('badge-contador');

// ======================================================
// 1. O ROBÔ (VERIFICADOR DE REGRAS)
// ======================================================
async function verificarRegrasDeNotificacao() {
    console.log("🤖 Robô de notificações verificando...");

    // Busca leads ativos (que não foram finalizados/invalidados)
    // Para otimizar, trazemos tudo e filtramos no JS, ou filtramos no query
    const leadsSnap = await getDocs(collection(db, "leads"));
    
    // Busca notificações já existentes (para não criar duplicado)
    const notifSnap = await getDocs(collection(db, "notificacoes"));
    const chavesExistentes = []; // Vamos guardar "IDLead_TipoAlerta"
    
    notifSnap.forEach(d => {
        const dados = d.data();
        chavesExistentes.push(`${dados.lead_id}_${dados.tipo_alerta}`);
    });

    const agora = new Date();

    leadsSnap.forEach(async (d) => {
        const lead = d.data();
        const leadId = d.id;

        // Se o lead não tem data de status ou já foi finalizado/invalido, ignora
        if (!lead.data_status) return;
        if (["Finalizado", "Lead Inválido", "Declinado"].includes(lead.status)) return;

        const dataStatus = new Date(lead.data_status);
        const diffMs = agora - dataStatus; // Diferença em milissegundos
        const diffHoras = diffMs / (1000 * 60 * 60);
        const diffDias = diffMs / (1000 * 60 * 60 * 24);

        let titulo = "";
        let mensagem = "";
        let tipoAlerta = ""; // Identificador único da regra

        // --- REGRA 1: Distribuído (24h depois) ---
        if (lead.status === "Distribuído" && diffHoras >= 0) {
            titulo = "⚠️ Cobrar Corretor";
            mensagem = `Falar com o corretor sobre Cliente <b>${lead.cliente}</b>`;
            tipoAlerta = "24h_distribuido";
        }

        // --- REGRA 2: Retornar depois (1 semana / 7 dias) ---
        else if (lead.status === "Retornar depois" && diffDias >= 7) {
            titulo = "📞 Retornar Contato";
            mensagem = `Retornar contato cliente <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_retornar";
        }

        // --- REGRA 3: Em negociação (1 semana) ---
        else if (lead.status === "Em negociação" && diffDias >= 7) {
            titulo = "👀 Acompanhamento";
            mensagem = `Falar com o corretor sobre Cliente <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_negociacao";
        }

        // --- REGRA 4: Proposta Gerada (1 semana) ---
        else if (lead.status === "Proposta Gerada" && diffDias >= 7) {
            titulo = "💼 Suporte Comercial";
            mensagem = `Falar com o Suporte sobre Proposta <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_proposta";
        }

        // --- DISPARAR NOTIFICAÇÃO (Se houver regra e não existir ainda) ---
        if (titulo && !chavesExistentes.includes(`${leadId}_${tipoAlerta}`)) {
            console.log(`🔔 Nova Notificação Gerada: ${mensagem}`);
            
            await addDoc(collection(db, "notificacoes"), {
                lead_id: leadId,
                titulo: titulo,
                mensagem: mensagem,
                tipo_alerta: tipoAlerta, // Evita duplicidade
                lida: false,
                timestamp: new Date().toISOString()
            });
            
            // Adiciona no array local para não criar de novo no mesmo loop
            chavesExistentes.push(`${leadId}_${tipoAlerta}`);
        }
    });
}

// ======================================================
// 2. A UI (EXIBIR E MARCAR COMO LIDA)
// ======================================================

// Escuta notificações em tempo real
const q = query(collection(db, "notificacoes"), where("lida", "==", false), orderBy("timestamp", "desc"));

onSnapshot(q, (snapshot) => {
    const qtd = snapshot.size;

    // Atualiza o Badge (Contador)
    if (qtd > 0) {
        badgeEl.textContent = qtd;
        badgeEl.classList.remove('d-none');
    } else {
        badgeEl.classList.add('d-none');
    }

    // Renderiza a Lista
    let html = '';
    if (qtd === 0) {
        html = '<li><span class="dropdown-item text-muted small text-center py-3">Tudo limpo! 🍃</span></li>';
    } else {
        snapshot.forEach(doc => {
            const n = doc.data();
            // Formatar data curta
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
                        <small class="text-muted" style="font-size:0.7rem">Clique para marcar como lida</small>
                    </a>
                </li>
            `;
        });
    }
    
    if(listaEl) listaEl.innerHTML = html;
});

// Função Global para marcar como lida
window.lerNotificacao = async (id, event) => {
    // Evita fechar o dropdown instantaneamente (opcional)
    if(event) event.preventDefault();

    try {
        const ref = doc(db, "notificacoes", id);
        await updateDoc(ref, { lida: true });
    } catch (error) {
        console.error(error);
    }
};

// Roda o robô verificador a cada 60 segundos (para não sobrecarregar)
// E roda uma vez assim que abre a página
verificarRegrasDeNotificacao();
setInterval(verificarRegrasDeNotificacao, 60000);
