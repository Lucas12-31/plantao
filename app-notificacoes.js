import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, updateDoc, doc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const listaEl = document.getElementById('lista-notificacoes');
const badgeEl = document.getElementById('badge-contador');

// ======================================================
// 1. O ROBÔ (VERIFICADOR DE REGRAS E RECORRÊNCIA)
// ======================================================
async function verificarRegrasDeNotificacao() {
    const leadsSnap = await getDocs(collection(db, "leads"));
    const notifSnap = await getDocs(collection(db, "notificacoes"));
    
    const mapaUltimaNotificacao = {}; 

    notifSnap.forEach(d => {
        const dados = d.data();
        const chave = `${dados.lead_id}_${dados.tipo_alerta}`;
        const dataNotif = new Date(dados.timestamp).getTime();

        if (!mapaUltimaNotificacao[chave] || dataNotif > mapaUltimaNotificacao[chave]) {
            mapaUltimaNotificacao[chave] = dataNotif;
        }
    });

    const agora = new Date();
    const agoraMs = agora.getTime();

    leadsSnap.forEach(async (d) => {
        const lead = d.data();
        const leadId = d.id;

        if (!lead.data_status) return;
        if (["Finalizado", "Lead Inválido", "Declinado"].includes(lead.status)) return;

        const dataStatus = new Date(lead.data_status);
        const diffStatusMs = agora - dataStatus; 
        const diffStatusHoras = diffStatusMs / (1000 * 60 * 60);
        const diffStatusDias = diffStatusMs / (1000 * 60 * 60 * 24);

        let titulo = "";
        let mensagem = "";
        let tipoAlerta = "";
        
        // Pega apenas o primeiro nome do corretor (Ex: "Lucas" em vez de "Lucas Silva")
        const primeiroNomeCorretor = lead.corretor_nome ? lead.corretor_nome.split(' ')[0] : 'Corretor';
        
        const intervaloRecorrenciaHoras = 24; 

        // --- REGRA 1: Distribuído ---
        if (lead.status === "Distribuído" && diffStatusHoras >= 24) {
            titulo = "⚠️ Cobrar Corretor";
            mensagem = `Falar com <b>${primeiroNomeCorretor}</b> sobre o lead <b>${lead.cliente}</b> (Parado há ${Math.floor(diffStatusDias)} dias).`;
            tipoAlerta = "24h_distribuido";
        }

        // --- REGRA 2: Retornar depois ---
        else if (lead.status === "Retornar depois" && diffStatusDias >= 7) {
            titulo = "📞 Retornar Contato";
            mensagem = `Prazo de retorno venceu! Cobrar <b>${primeiroNomeCorretor}</b> sobre <b>${lead.cliente}</b>.`;
            tipoAlerta = "7d_retornar";
        }

        // --- REGRA 3: Em negociação ---
        else if (lead.status === "Em negociação" && diffStatusDias >= 7) {
            titulo = "👀 Acompanhamento";
            mensagem = `Negociação lenta. Verificar cliente <b>${lead.cliente}</b> com <b>${primeiroNomeCorretor}</b>.`;
            tipoAlerta = "7d_negociacao";
        }

        // --- REGRA 4: Proposta Gerada ---
        else if (lead.status === "Proposta Gerada" && diffStatusDias >= 7) {
            titulo = "💼 Suporte Comercial";
            mensagem = `Proposta pendente! Verificar <b>${lead.cliente}</b> (De: <b>${primeiroNomeCorretor}</b>) com o Suporte.`;
            tipoAlerta = "7d_proposta";
        }

        // --- LÓGICA DE DISPARO ---
        if (titulo) {
            const chave = `${leadId}_${tipoAlerta}`;
            const ultimaVez = mapaUltimaNotificacao[chave];
            
            let devoNotificar = false;

            if (!ultimaVez) {
                devoNotificar = true;
                console.log(`[Novo Alerta] ${lead.cliente} - ${tipoAlerta}`);
            } else {
                const diffUltimaNotifHoras = (agoraMs - ultimaVez) / (1000 * 60 * 60);
                if (diffUltimaNotifHoras >= intervaloRecorrenciaHoras) {
                    devoNotificar = true;
                    console.log(`[Recorrência] ${lead.cliente} - Cobrando novamente.`);
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

window.lerNotificacao = async (id, event) => {
    if(event) event.preventDefault();
    try {
        await updateDoc(doc(db, "notificacoes", id), { lida: true });
    } catch (error) {
        console.error(error);
    }
};

verificarRegrasDeNotificacao();
setInterval(verificarRegrasDeNotificacao, 600000);
