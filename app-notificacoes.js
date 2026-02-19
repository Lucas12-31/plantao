import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, updateDoc, doc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const listaEl = document.getElementById('lista-notificacoes');
const badgeEl = document.getElementById('badge-contador');

// ======================================================
// 1. O ROBÔ (VERIFICADOR DE REGRAS E RECORRÊNCIA)
// ======================================================
async function verificarRegrasDeNotificacao() {
    // 1. Pega todos os leads
    const leadsSnap = await getDocs(collection(db, "leads"));
    
    // 2. Pega todas as notificações para montar o histórico
    // Precisamos saber QUANDO foi a última notificação de cada tipo para cada lead
    const notifSnap = await getDocs(collection(db, "notificacoes"));
    
    const mapaUltimaNotificacao = {}; 
    // Estrutura do mapa: { "IDdoLead_TipoAlerta": TimestampDaUltimaVez }

    notifSnap.forEach(d => {
        const dados = d.data();
        const chave = `${dados.lead_id}_${dados.tipo_alerta}`;
        const dataNotif = new Date(dados.timestamp).getTime();

        // Se já tem uma data guardada, só atualiza se essa for mais recente
        if (!mapaUltimaNotificacao[chave] || dataNotif > mapaUltimaNotificacao[chave]) {
            mapaUltimaNotificacao[chave] = dataNotif;
        }
    });

    const agora = new Date();
    const agoraMs = agora.getTime();

    leadsSnap.forEach(async (d) => {
        const lead = d.data();
        const leadId = d.id;

        // Ignora leads finalizados ou sem data de status
        if (!lead.data_status) return;
        if (["Finalizado", "Lead Inválido", "Declinado"].includes(lead.status)) return;

        // Cálculos de tempo do STATUS (Há quanto tempo o lead está parado nesse status?)
        const dataStatus = new Date(lead.data_status);
        const diffStatusMs = agora - dataStatus; 
        const diffStatusHoras = diffStatusMs / (1000 * 60 * 60);
        const diffStatusDias = diffStatusMs / (1000 * 60 * 60 * 24);

        let titulo = "";
        let mensagem = "";
        let tipoAlerta = "";
        
        // Variável para definir a regra de recorrência (geralmente 24h depois da última notificação)
        const intervaloRecorrenciaHoras = 24; 

        // --- REGRA 1: Distribuído (Primeiro alerta: 24h | Recorrência: Diária) ---
        if (lead.status === "Distribuído" && diffStatusHoras >= 24) {
            titulo = "⚠️ Cobrar Corretor";
            mensagem = `Lead parado há ${Math.floor(diffStatusDias)} dias! Falar com corretor sobre <b>${lead.cliente}</b>`;
            tipoAlerta = "24h_distribuido";
        }

        // --- REGRA 2: Retornar depois (Primeiro alerta: 7 dias | Recorrência: Diária) ---
        else if (lead.status === "Retornar depois" && diffStatusDias >= 7) {
            titulo = "📞 Retornar Contato";
            mensagem = `Prazo de retorno venceu! Contatar <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_retornar";
        }

        // --- REGRA 3: Em negociação (Primeiro alerta: 7 dias | Recorrência: Diária) ---
        else if (lead.status === "Em negociação" && diffStatusDias >= 7) {
            titulo = "👀 Acompanhamento";
            mensagem = `Negociação lenta (+7 dias). Verificar <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_negociacao";
        }

        // --- REGRA 4: Proposta Gerada (Primeiro alerta: 7 dias | Recorrência: Diária) ---
        else if (lead.status === "Proposta Gerada" && diffStatusDias >= 7) {
            titulo = "💼 Suporte Comercial";
            mensagem = `Proposta pendente há uma semana. Verificar <b>${lead.cliente}</b>`;
            tipoAlerta = "7d_proposta";
        }

        // --- LÓGICA DE DISPARO INTELIGENTE ---
        if (titulo) {
            const chave = `${leadId}_${tipoAlerta}`;
            const ultimaVez = mapaUltimaNotificacao[chave];
            
            let devoNotificar = false;

            if (!ultimaVez) {
                // Caso 1: Nunca foi notificado desse tipo. Manda a primeira!
                devoNotificar = true;
                console.log(`[Novo Alerta] ${lead.cliente} - ${tipoAlerta}`);
            } else {
                // Caso 2: Já foi notificado. Verificamos se já passou 24h desde a última vez.
                const diffUltimaNotifHoras = (agoraMs - ultimaVez) / (1000 * 60 * 60);
                
                if (diffUltimaNotifHoras >= intervaloRecorrenciaHoras) {
                    devoNotificar = true;
                    console.log(`[Recorrência Diária] ${lead.cliente} - Já passou ${diffUltimaNotifHoras.toFixed(1)}h desde o último aviso.`);
                }
            }

            if (devoNotificar) {
                await addDoc(collection(db, "notificacoes"), {
                    lead_id: leadId,
                    titulo: titulo,
                    mensagem: mensagem,
                    tipo_alerta: tipoAlerta,
                    lida: false,
                    timestamp: new Date().toISOString()
                });
                
                // Atualiza o mapa local para não disparar várias vezes seguidas no mesmo loop
                mapaUltimaNotificacao[chave] = agoraMs;
            }
        }
    });
}

// ======================================================
// 2. A UI (VISUAL E INTERAÇÃO)
// ======================================================
const q = query(collection(db, "notificacoes"), where("lida", "==", false), orderBy("timestamp", "desc"));

onSnapshot(q, (snapshot) => {
    const qtd = snapshot.size;

    if (badgeEl) {
        if (qtd > 0) {
            badgeEl.textContent = qtd;
            badgeEl.classList.remove('d-none');
        } else {
            badgeEl.classList.add('d-none');
        }
    }

    let html = '';
    if (qtd === 0) {
        html = '<li><span class="dropdown-item text-muted small text-center py-3">Tudo limpo! 🍃</span></li>';
    } else {
        snapshot.forEach(doc => {
            const n = doc.data();
            const dataN = new Date(n.timestamp).toLocaleDateString('pt-BR');
            // Formatar hora também para ficar mais preciso
            const horaN = new Date(n.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

            html += `
                <li>
                    <a class="dropdown-item p-2 border-bottom" href="#" onclick="lerNotificacao('${doc.id}', event)">
                        <div class="d-flex w-100 justify-content-between">
                            <strong class="mb-1 text-primary" style="font-size:0.85rem">${n.titulo}</strong>
                            <small class="text-muted" style="font-size:0.7rem">${dataN} ${horaN}</small>
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

// Roda verificação inicial e depois a cada 10 minutos
verificarRegrasDeNotificacao();
setInterval(verificarRegrasDeNotificacao, 600000);
