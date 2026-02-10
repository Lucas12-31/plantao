import { db } from "./firebase-config.js";
import { collection, getDocs, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const grid = document.getElementById('calendario-grid');

// Função Principal
window.montarEscala = async () => {
    grid.innerHTML = '<div class="text-center w-100 mt-5">Carregando corretores e gerando escala...</div>';
    
    // 1. Pegar Corretores Elegíveis (Com saldo > 0)
    const snapshot = await getDocs(collection(db, "corretores"));
    let poolCorretores = [];
    
    snapshot.forEach(d => {
        let dados = d.data();
        // Só entra na escala se tiver ganhado algum lead (PME ou PF)
        if ((dados.saldo_pme > 0 || dados.saldo_pf > 0)) {
            poolCorretores.push({ id: d.id, ...dados });
        }
    });

    if (poolCorretores.length < 3) {
        return alert("Você precisa de pelo menos 3 corretores com leads para gerar um rodízio.");
    }

    // 2. Gerar Dias Úteis do Mês Atual
    let diasUteis = getDiasUteisMes();
    
    // 3. Algoritmo de Rodízio
    let escalaFinal = {}; // Ex: { "10/02": [corretorA, corretorB, corretorC] }
    let ultimoPlantao = []; // Quem trabalhou ontem

    diasUteis.forEach(dia => {
        let escaladosHoje = [];
        let tentativas = 0;

        while (escaladosHoje.length < 3 && tentativas < 100) {
            // Sorteia alguém
            let candidato = poolCorretores[Math.floor(Math.random() * poolCorretores.length)];
            
            // Regras: 
            // 1. Não pode estar escalado hoje já.
            // 2. Não pode ter trabalhado ontem (ultimoPlantao).
            let jaEstaHoje = escaladosHoje.some(c => c.id === candidato.id);
            let trabalhouOntem = ultimoPlantao.some(c => c.id === candidato.id);

            // Se o time for pequeno (menos de 6), relaxamos a regra de "trabalhou ontem"
            if (poolCorretores.length < 6) trabalhouOntem = false;

            if (!jaEstaHoje && !trabalhouOntem) {
                escaladosHoje.push(candidato);
            }
            tentativas++;
        }
        
        escalaFinal[dia] = escaladosHoje;
        ultimoPlantao = escaladosHoje; // Atualiza para o próximo dia
    });

    renderizarCalendario(diasUteis, escalaFinal);
};

// Gera dias de Seg a Sex do mês atual
function getDiasUteisMes() {
    let date = new Date();
    let month = date.getMonth();
    let year = date.getFullYear();
    let days = [];
    
    date.setDate(1);
    
    while (date.getMonth() === month) {
        let diaSemana = date.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { // 0=Dom, 6=Sab
            days.push(new Date(date).toLocaleDateString('pt-BR'));
        }
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function renderizarCalendario(dias, escala) {
    grid.innerHTML = '';
    
    dias.forEach(dia => {
        let corretoresDoDia = escala[dia] || [];
        
        let htmlCorretores = corretoresDoDia.map(c => {
            // Gera Checkboxes PME
            let checksPME = gerarCheckboxes(c.id, 'pme', c.saldo_pme, c.leads_entregues_pme || 0);
            
            return `
                <div class="corretor-card text-start">
                    <strong>${c.nome.split(' ')[0]}</strong>
                    <div class="mt-1">
                        <small class="badge bg-warning text-dark">PME (${c.saldo_pme})</small>
                        <div class="d-flex gap-1 mt-1 flex-wrap">${checksPME}</div>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML += `
            <div class="col">
                <div class="calendar-day p-2">
                    <div class="text-end text-muted mb-2">${dia.slice(0,5)}</div> ${htmlCorretores}
                </div>
            </div>
        `;
    });

    ativarCliques();
}

// Gera o HTML das caixinhas [ ] [x]
function gerarCheckboxes(idCorretor, tipo, total, entregues) {
    let html = '';
    for (let i = 1; i <= total; i++) {
        let isChecked = i <= entregues ? "checked" : "";
        let icon = i <= entregues ? "✅" : "⬜";
        
        // Cada checkbox é um span clicável
        html += `<span class="check-lead" 
                    data-id="${idCorretor}" 
                    data-tipo="${tipo}" 
                    data-idx="${i}" 
                    title="Marcar lead entregue">${icon}</span>`;
    }
    return html;
}

// Lógica de clicar no checkbox e salvar
function ativarCliques() {
    document.querySelectorAll('.check-lead').forEach(el => {
        el.addEventListener('click', async (e) => {
            let id = e.target.dataset.id;
            let tipo = e.target.dataset.tipo; // 'pme' ou 'pf'
            let idx = parseInt(e.target.dataset.idx); // qual quadradinho é (1, 2, 3...)
            
            // Só confirma se clicar, por exemplo, no quadrado vazio
            if(confirm(`Confirmar entrega do Lead ${idx} para este corretor?`)) {
                const docRef = doc(db, "corretores", id);
                
                // Atualiza contagem no banco
                let campo = tipo === 'pme' ? 'leads_entregues_pme' : 'leads_entregues_pf';
                
                // Truque: salvamos o índice clicado como o novo total de entregues
                // Ex: se clicou no 3º quadrado, significa que entregou 3.
                await updateDoc(docRef, {
                    [campo]: idx
                });

                // Atualiza visualmente (recarrega a tela é mais seguro pra sincronizar)
                window.montarEscala(); 
            }
        });
    });
}

// Carrega automaticamente ao abrir
window.montarEscala();
