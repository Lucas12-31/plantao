import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot, addDoc, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const tabelaBody = document.getElementById('tabela-body');
const cabecalhoTabela = document.getElementById('cabecalho-tabela');
const filtroMes = document.getElementById('filtro-mes');
const filtroSemana = document.getElementById('filtro-semana');

const formFeriado = document.getElementById('form-feriado');
const listaFeriadosEl = document.getElementById('lista-feriados');

let estado = { 
    corretores: [], 
    leads: [], 
    feriados: [], 
    escalaFixa: {}, 
    diasDoMes: [], 
    semanas: [] 
};
let carregamentoInicial = true;

// VARIÁVEL DE CONTROLE DE VAGAS
let qtdVagas = 3; 

// ==========================================
// 1. INICIALIZAÇÃO E AÇÕES
// ==========================================
window.iniciarPlantao = async () => {
    if (!filtroMes.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroMes.value = `${yyyy}-${mm}`;
    }

    tabelaBody.innerHTML = `<tr><td colspan="${qtdVagas + 1}" class="text-center py-5">Buscando dados no servidor...</td></tr>`;

    const qFeriados = query(collection(db, "feriados"), orderBy("data", "asc"));
    onSnapshot(qFeriados, (snap) => {
        estado.feriados = [];
        let htmlFeriados = '';
        
        snap.forEach(d => {
            const f = d.data();
            estado.feriados.push({ id: d.id, ...f });
            
            const dataFmt = f.data.split('-').reverse().join('/');
            htmlFeriados += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <strong class="text-danger">${dataFmt}</strong><br>
                        <small class="text-muted">${f.descricao}</small>
                    </div>
                    <button onclick="deletarFeriado('${d.id}')" class="btn btn-sm btn-outline-danger" title="Remover Folga">🗑️</button>
                </li>
            `;
        });
        
        if(estado.feriados.length === 0) htmlFeriados = '<li class="list-group-item text-muted text-center">Nenhum feriado cadastrado.</li>';
        if(listaFeriadosEl) listaFeriadosEl.innerHTML = htmlFeriados;

        estado.escalaFixa = {}; 
        atualizarVisualizacao();
    });

    const snapCorretores = await getDocs(collection(db, "corretores"));
    estado.corretores = [];
    snapCorretores.forEach(d => {
        let dados = d.data();
        if (dados.saldo_pme > 0 || dados.saldo_pf > 0) {
            estado.corretores.push({ id: d.id, ...dados });
        }
    });

    onSnapshot(collection(db, "leads"), (snap) => {
        estado.leads = [];
        snap.forEach(d => estado.leads.push(d.data()));
        atualizarVisualizacao();
    });
};

// ==========================================
// NOVA FUNÇÃO: ADICIONAR/REMOVER VAGAS
// ==========================================
window.alterarVagas = (valor) => {
    const novaQtd = qtdVagas + valor;
    
    if (novaQtd < 1) return alert("O plantão precisa ter no mínimo 1 vaga.");
    if (novaQtd > 8) return alert("Limite máximo de 8 vagas atingido.");
    
    qtdVagas = novaQtd;
    document.getElementById('contador-vagas').innerText = `${qtdVagas} Vagas`;

    // Se o gestor confirmar, apaga a memória do mês atual e sorteia tudo de novo
    if (confirm(`A tabela foi ajustada para ${qtdVagas} vagas.\n\nDeseja realizar um NOVO SORTEIO para preencher a tabela corretamente?`)) {
        estado.escalaFixa[filtroMes.value] = null;
    }
    
    atualizarVisualizacao();
};

// ==========================================
// 2. RENDERIZAÇÃO E CÁLCULO DA ESCALA
// ==========================================
function atualizarVisualizacao() {
    const [ano, mes] = filtroMes.value.split('-');
    
    estado.diasDoMes = getDiasUteisMes(parseInt(ano), parseInt(mes) - 1, estado.feriados);
    estado.semanas = agruparSemanas(estado.diasDoMes);

    if (carregamentoInicial) {
        const hojeISO = new Date().toISOString().split('T')[0];
        const indexSemanaAtual = estado.semanas.findIndex(semana => semana.some(dia => dia.iso === hojeISO));
        if (indexSemanaAtual !== -1) filtroSemana.value = indexSemanaAtual;
        carregamentoInicial = false;
    }

    if (!estado.escalaFixa[filtroMes.value]) {
        estado.escalaFixa[filtroMes.value] = gerarLogicaRodizio(estado.diasDoMes, estado.corretores);
    }
    
    // Atualiza o Cabeçalho Dinamicamente
    if (cabecalhoTabela) {
        let htmlCabecalho = '<th style="width: 15%;">Data</th>';
        for (let i = 1; i <= qtdVagas; i++) {
            htmlCabecalho += `<th>Vaga ${i}</th>`;
        }
        cabecalhoTabela.innerHTML = htmlCabecalho;
    }

    const escalaAtual = estado.escalaFixa[filtroMes.value];
    const indiceSemana = parseInt(filtroSemana.value);
    const diasDaSemana = estado.semanas[indiceSemana] || [];

    if (diasDaSemana.length === 0) {
        tabelaBody.innerHTML = `<tr><td colspan="${qtdVagas + 1}" class="text-center py-4 text-muted">Não há dias úteis nesta semana.</td></tr>`;
        return;
    }

    let htmlBody = '';
    
    diasDaSemana.forEach(dia => {
        let hojeISO = new Date().toISOString().split('T')[0];
        let classHoje = (dia.iso === hojeISO) ? "bg-warning" : "bg-white";
        let textoHoje = (dia.iso === hojeISO) ? '<br><span class="badge bg-danger mt-1">HOJE</span>' : '';
        let classFeriadoTd = dia.isFeriado ? "bg-danger text-white bg-opacity-75 border-danger" : classHoje;

        htmlBody += `<tr>`;
        htmlBody += `
            <td class="${classFeriadoTd} border-end border-3 border-dark fw-bold text-center" style="min-width: 140px; vertical-align: middle;">
                <div class="fs-4">${dia.diaSemana}</div>
                <div class="${dia.isFeriado ? 'text-white' : 'text-muted'}">${dia.fmt}</div>
                ${textoHoje}
            </td>
        `;

        // SE FOR FERIADO, JUNTA TODAS AS COLUNAS (qtdVagas)
        if (dia.isFeriado) {
            htmlBody += `
                <td colspan="${qtdVagas}" class="bg-light align-middle text-center" style="height: 100px;">
                    <div class="alert alert-secondary mb-0 d-inline-block shadow-sm border-secondary fw-bold fs-5 px-5 py-3">
                        🏖️ Folga / Feriado: <span class="text-danger">${dia.descricaoFeriado}</span>
                    </div>
                </td>
            `;
        } 
        // SE FOR DIA ÚTIL, GERA O NÚMERO EXATO DE VAGAS
        else {
            const escalados = escalaAtual[dia.iso] || [];

            for (let i = 0; i < qtdVagas; i++) {
                let corretor = escalados[i];

                if (corretor) {
                    const leadsPME = estado.leads.filter(l => 
                        l.corretor_id === corretor.id && l.data_entrega === dia.iso && 
                        l.tipo === 'pme' && l.status !== 'Lead Inválido' 
                    ).length;

                    const leadsPF = estado.leads.filter(l => 
                        l.corretor_id === corretor.id && l.data_entrega === dia.iso && 
                        l.tipo === 'pf' && l.status !== 'Lead Inválido'
                    ).length;

                    htmlBody += `
                        <td>
                            <div class="card-vaga text-center h-100 d-flex flex-column justify-content-center">
                                <div class="nome-corretor text-truncate w-100 mx-auto" title="${corretor.nome}">
                                    ${corretor.nome.split(' ')[0]}
                                </div>
                                <div class="d-flex justify-content-center gap-2 mt-2">
                                    <span class="badge bg-warning text-dark border border-dark p-2" style="min-width: 60px;">PME: ${leadsPME}</span>
                                    <span class="badge bg-info text-white border border-dark p-2" style="min-width: 60px;">PF: ${leadsPF}</span>
                                </div>
                            </div>
                        </td>
                    `;
                } else {
                    htmlBody += `<td class="bg-light text-muted fst-italic align-middle text-center"><small>Vaga Livre</small></td>`;
                }
            }
        }
        
        htmlBody += `</tr>`;
    });
    tabelaBody.innerHTML = htmlBody;
}

filtroMes.addEventListener('change', atualizarVisualizacao);
filtroSemana.addEventListener('change', atualizarVisualizacao);

window.refazerSorteio = () => {
    if(confirm("Refazer o sorteio apagará a ordem atual deste mês e os corretores trocarão de dias. Continuar?")) {
        estado.escalaFixa[filtroMes.value] = null;
        atualizarVisualizacao();
    }
};

// ==========================================
// 3. LÓGICA MATEMÁTICA E CALENDÁRIO
// ==========================================

function getDiasUteisMes(ano, mesIndex, listaDeFeriados = []) {
    let date = new Date(ano, mesIndex, 1);
    let days = [];
    const nomesDias = ['Dom', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sáb'];
    
    while (date.getMonth() === mesIndex) {
        let diaSemana = date.getDay();
        let iso = date.toISOString().split('T')[0]; 
        
        let feriadoEncontrado = listaDeFeriados.find(f => f.data === iso);

        if (diaSemana !== 0 && diaSemana !== 6) { 
            let fmt = date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            
            days.push({ 
                iso, 
                fmt, 
                diaSemana: nomesDias[diaSemana],
                isFeriado: !!feriadoEncontrado, 
                descricaoFeriado: feriadoEncontrado ? feriadoEncontrado.descricao : "" 
            });
        }
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function agruparSemanas(diasUteis) {
    let semanas = [];
    let semanaAtual = [];
    diasUteis.forEach(dia => {
        semanaAtual.push(dia);
        if (dia.diaSemana === 'Sexta' || semanaAtual.length === 5) {
            semanas.push(semanaAtual);
            semanaAtual = [];
        }
    });
    if (semanaAtual.length > 0) semanas.push(semanaAtual);
    return semanas;
}

function gerarLogicaRodizio(dias, corretores) {
    if (corretores.length === 0) return {};
    let escala = {};
    let ultimoPlantao = [];
    
    dias.forEach(objDia => { 
        if (objDia.isFeriado) {
            escala[objDia.iso] = [];
            return; 
        }

        let escalados = [];
        let tentativas = 0;
        
        // AGORA USA A VARIÁVEL "qtdVagas" PARA DEFINIR O LIMITE!
        while (escalados.length < qtdVagas && tentativas < 100) {
            let cand = corretores[Math.floor(Math.random() * corretores.length)];
            let jaEsta = escalados.some(c => c.id === cand.id);
            let trabalhouOntem = ultimoPlantao.some(c => c.id === cand.id);
            
            // Se houver pouca gente na equipe, desativa a regra de não trabalhar 2 dias seguidos
            if (corretores.length <= qtdVagas * 1.5) trabalhouOntem = false;
            
            if (!jaEsta && !trabalhouOntem) escalados.push(cand);
            tentativas++;
        }
        escala[objDia.iso] = escalados;
        ultimoPlantao = escalados;
    });
    return escala;
}

// ==========================================
// 4. CRUD DE FERIADOS
// ==========================================
if(formFeriado) {
    formFeriado.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dataIn = document.getElementById('data-feriado').value;
        const descIn = document.getElementById('desc-feriado').value;

        try {
            await addDoc(collection(db, "feriados"), {
                data: dataIn,
                descricao: descIn,
                timestamp: new Date().toISOString()
            });
            formFeriado.reset();
        } catch (error) {
            console.error(error);
            alert("Erro ao adicionar folga.");
        }
    });
}

window.deletarFeriado = async (id) => {
    if(confirm("Excluir este feriado? A escala voltará a usar este dia como útil.")) {
        await deleteDoc(doc(db, "feriados", id));
    }
};

window.iniciarPlantao();
