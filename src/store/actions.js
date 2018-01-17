// @flow
import R from 'ramda'
import uuidv1 from 'uuid/v1'

import { getFieldsList, getItems, getFilteredItems, saveFieldItems, getTemplate, getItemMaster, getItemDetail, getListData } from '../api'

// [{Guid: 1}, ...] -> {1: {}, ...}
export const transformFieldsList = R.pipe(
    R.groupBy(f => f.Guid),
    R.map(R.head)
)

// {DefaultValue: 1} -> {DefaultValue: 1, value: 1}
const assignValue = R.pipe(
    R.juxt([f => f.DefaultValue, R.identity]),
    x => R.assoc('value', ...x)
)

const addToSelect = (res, { InternalName }) => {
    return res + InternalName + ','
}

const constructSelect = R.pipe(
    R.reject(R.propEq('Type', 'MasterDetail')),
    R.values,
    R.reduce(addToSelect, ''),
    R.slice(0, -1) // Remove last comma :grin
)

function setListData ({ commit, state }) {
    return getListData(state.listId)
        .fork(
            err  => commit('addError', err),
            listData => commit('setListData', listData)
        )
}

export function loadFields ({ commit, state, getters }) {
    return new Promise((resolve, reject) => {
        getFieldsList(state.listId, Number(state.itemId), state.contentTypeId)
            .fork(
                err => {
                    commit('addError', err)
                    reject(err)
                },
                res => {
                    let fields = R.pipe(
                        R.prop('fields'),
                        R.map(assignValue),
                        transformFieldsList
                    )(res)
                    commit('loadFields', fields)
                    setListData({ commit, state })
                    const select = constructSelect(fields)
                    showFieldsList({ commit, state, getters }, { select })

                    commit('loadHistories', res.histories)
                    resolve(res)
                }
            )
    })
}

export function loadOptions({ commit }, { id, listId }) {
    return getItems(listId)
        .fork(
            err     => commit('addError', err),
            options => commit('loadOptions', { id, options })
        )
}

export function loadFilteredOptions({ commit }, { id, listId, query }) {
    if (query.indexOf('null') === -1) {
        return getFilteredItems(listId, query)
            .fork(
                err     => commit('addError', err),
                options => commit('loadOptions', { id, options })
            )
    }
}

// export function loadContractSpec({ commit, state }){
//     return getContractSpec(state.contractId)
//         .map(R.head) //TODO: should change for deployment!
//         .fork(
//             err => commit('addError', err),
//             res => commit('loadContractSpec', res)
//         )
// }

export function changeField({ commit }, payload) {
    commit('changeField', payload)
}

export function loadComputed ({ commit }, { id, listId, query , select , func }) {
    let realFunc = computeFunction(func)
    if (query.indexOf('null') === -1) {
        return getFilteredItems(listId, query)
            .map(R.map(R.prop(select)))
            .fork(
                err      => commit('addError', err),
                computed => {
                    let value = Array.isArray(computed) ? realFunc(computed) : computed // it needs to check different strunctors of retruned value
                    commit('changeField', { id, value })
                }
            )
    }
    commit('changeField', { id, value: '' })
}

export function MDLoadFields ({ commit, state }, { id, listId, masterLookupName } ) {
    return new Promise((resolve, reject) => {
        getFieldsList(listId, '', state.dContentTypeId)
            .map(R.map(assignValue))
            .map(transformFieldsList)
            .fork(
                err => {
                    commit('addError', err);
                    reject(err);
                },
                fields => {
                    commit('MDLoadFields', { id, fields })
                    const select = constructSelect(fields)
                    showDetailFieldsList({ commit, state }, { id, listId, select, masterLookupName })
                    resolve(fields)
                }
            )
    })
}

export function MDChangeFieldRow ({ commit }, payload) {
    commit('MDChangeFieldRow', payload)
}

export function MDLoadOptions ({ state, commit }, { id, masterId, rowId, listId }) {
    return getItems(listId)
        .fork(
            err     => {
                err ? commit('addError', err+'<'+state.fields[masterId]['rows'][rowId][id]['InternalName']+'> field')
                    : commit('addError','<'+state.fields[masterId]['rows'][rowId][id]['InternalName']+'> field')
            },
            options => commit('MDLoadOptions', { id, masterId, rowId, options })
        )
}

function MDLoadLookupOptions ({ commit }, { masterId, id, listId }) {
    return getItems(listId)
        .fork(
            err     => commit('addError', err),
            options => commit('MDLoadLookupOptions', { id, masterId, options })
        )
}

export function MDLoadAllLookupOptions ({ commit, state }, { masterId } ) {
    R.pipe (
        R.filter(R.propSatisfies(R.either(R.equals('Lookup'), R.equals('LookupMulti')), 'Type')),
        R.mapObjIndexed(
            (v, id) =>
                MDLoadLookupOptions({ commit },
                                    { id, masterId, listId: v.LookupList })
        )
    )(state.fields[masterId].fields)
}

export function MDLoadFilteredOptions ({ state, commit }, { id, masterId, rowId, listId, query }) {
    return query.indexOf('null') === -1
        ? getFilteredItems(listId, query)
        .fork (
            err     => {
                err ? commit('addError', err+' ***there is an error in <'+state.fields[masterId]['rows'][rowId][id]['InternalName']+'> field')
                    : commit('addError','There is an error in <'+state.fields[masterId]['rows'][rowId][id]['InternalName']+'> field')
            },
            options => commit('MDLoadOptions', { id, masterId, rowId, options })
        )
    : commit('MDLoadOptions', { id, masterId, rowId, options: null })
}

export function MDAddRow ({ commit }, { id }) {
    let rowId = uuidv1()
    commit('MDAddRow', { id, rowId })
    return rowId
}

export function MDDelRow ({ commit }, rowProps) {
    commit('MDDelRow', rowProps)
}

const computeFunction = func => {
    switch(func) {
    case 'Sum':
        return R.sum
    case 'Multi':
        return R.product
    case 'Avg':
        return R.mean
    case 'Min':
        return R.apply(R.min)
    case 'Max':
        return R.apply(R.max)
    case 'First':
        return R.head
    }
}

export function MDLoadComputed ({ commit }, { id, masterId, rowId, listId, query , select , func }) {
    let realFunc = computeFunction(func)
    if (query.indexOf('null') === -1) {
        return getFilteredItems(listId, query)
            .map(R.map(R.prop(select)))
            .fork(
                err      => commit('addError', err),
                computed => {
                    let value = Array.isArray(computed) ? realFunc(computed) : computed // it needs to check different strunctors of retruned value
                    commit('MDChangeFieldRow', { masterId, rowId, fieldId: id, value })
                }
            )
    }
    commit('MDChangeFieldRow', { masterId, rowId, fieldId: id, value: null })
}

const transFormFields= R.pipe(
    R.values,
    R.project(['InternalName', 'Type', 'value', 'rows', 'LookupList']),
    R.map(R.map(f => f == null ? '' : f)), // remove null values
    R.map(f => f.rows == '' ? R.assoc('rows', [], f) : f), // replace rows null value with empty array
    R.map(f => (f.InternalName == 'ID' && f.value == '') ? R.assoc('value', 0, f) : f), // replace ID of null with 0 value
    R.map(f => (f.Type == 'Number' && f.value == '') ? R.assoc('value', 0, f) : f), // replace Number of null with 0 value
    R.reject(R.propEq('Type', 'File'))
)

const transFormRows = R.map(
    R.ifElse(
        R.propEq('Type', 'MasterDetail'),
        field => R.assoc('rows', R.values(R.map(transFormFields, field.rows)), field),
        R.identity
    )
)

const transFormForSave = R.pipe(
        transFormFields,
        transFormRows
)

export function saveData ({ commit, state }) {
    let data = transFormForSave(state.fields)
    commit('setLoadingTrue')
    return new Promise((resolve, reject) => {
        saveFieldItems(state.listId, data, state.deletedItems, R.values(state.addFiles), R.values(state.deleteFiles))
            .fork(
                err  => {
                    commit('addError', 'در عملیات ذخیره سازی خطای شبکه رخ داد مجددا ذخیره کنید')
                    commit('setLoadingFalse')
                    reject(err)
                },
                succ => {
                    commit('setLoadingFalse')
                    resolve(succ)
                }
            )
    })
}

export function removeError ({ commit }, error) {
    commit('removeError', error)
}

export function loadTemplateMetaData({ commit, state }) {
    return getTemplate(state.listId)
        .map(R.head)
        .fork(
            err  => commit('loadTemplateMetaData', { templateName: 'SimpleColumn', columnsNum: 2, template: '' + err }),
            succ => {
                let fields = transformFields(state.fields)
                let firstTemplate = replaceTemplateStr(succ.template || '', fields)

                let secondTemplate = firstTemplate.replace(
                    new RegExp(/{{(\w+)(:[^}:]+)(:\[.*\])}}/, 'g'),
                    (s, fname, fields, headers) => {
                        let showFields = fields.substr(1).split(',')
                        let headersArr = headers.substr(1)
                        return `<el-form label-position="top">
                                    <el-form-item>
                                        <div class='detail-title'>${fname}</div>
                                            <Field fieldId='{{${fname}}}' class="${fname}" showFields="${showFields}" headers='${headersArr}'></Field>
                                            <div class='detail-item'>
                                        </div>
                                    </el-form-item>
                                </el-form>`
                    }
                )
                let template = replaceNameWithId(secondTemplate, fields)
                commit('loadTemplateMetaData', {
                    templateName: succ.templateName || 'TwoSide',
                    columnsNum: succ.columnsNum || 2,
                    template
                })

            }
        )
}

const transformFields= R.pipe(
    R.values,
    R.reduce((acc, curr) => ({
        ...acc,
        [curr.InternalName]: {
            'id': curr.Guid,
            'title': curr.Title,
            'intName': curr.InternalName,
            'isRequire': curr.IsRequire
        }
    }), {})
)

const replaceTemplateStr = (str, fields) => R.reduce(
    (q, field) => R.replace(
        new RegExp('{{'+field+'}}', 'g'),
        `<el-form label-position="top" class="master-field">
            <el-form-item :class="{require: ${fields[field].IsRequire}}">
            <div class='master-title'>${fields[field].title}</div>
            <div class='master-item'>
                <Field fieldId="${fields[field].id}" class="${field}" ></Field>
            </div>
            </el-form-item>
        </el-form>`,
        q),
    str,
    R.keys(fields)
)

const replaceNameWithId = (str, fields) => R.reduce(
    (q, field) => R.replace(
        new RegExp('{{'+field+'}}', 'g'),
        `${fields[field].id}`,
        q),
    str,
    R.keys(fields)
)

export function removeServerError({ commit }, { row, internalName }){
    commit('removeServerError', { row, internalName })
}

export function loadServerErrors({ commit }, errors){
    errors = R.chain(transformError, errors)
    commit('loadServerErrors', errors)
}

const transformError = ({ Message, RowNumber, FieldNames }) => {
    return R.map(field => {
        return {
            Message,
            RowNumber,
            InternalName: field,
            RelatedFields: FieldNames
        }
    }, FieldNames)
}

const shapeData = (value, InternalName) => { // key in the comming items is the InternalName of Field
    return typeof value == 'object' ? { InternalName, value: value ? value.Title : '' } : { InternalName, value }
}

export function loadFieldsList({ commit, state, getters }, { items }) {
    let fieldValues = R.values(R.mapObjIndexed(shapeData, items))
    R.map(x => commit('setFieldValue', x), fieldValues)
    if (!getters.isThereDetails) { setTimeout(() => commit('setLoadingFalse'), 1000)}
}

export function showFieldsList ({ commit, state, getters }, { select }) {
    let { listId, itemId } = state
    return getItemMaster(listId, itemId, select)
        .map(x => JSON.parse(x))
        .map(R.head)
        .fork(
            err     => commit('addError', err),
            items   => {
                loadFieldsList({ commit, state, getters }, { items })
            }
        )
}

// export function loadMasterFieldsList({ commit }, { items, id }) {
//     return new Promise(resolve => {
//         if (items.length > 0) {
//             items.map((rowItems, k) => {
//                 let fieldValues = R.values(R.mapObjIndexed(shapeData, rowItems))
//                 R.map(x => commit('MDSetFieldRow', { ...x, masterId: id, rowIndex: k }), fieldValues)
//                 if (k == items.length - 1) {
//                     setTimeout(() => resolve('done'), 2000)
//                 }
//             })
//         } else {
//             MDAddRow({ commit }, { id })
//             setTimeout(() => resolve('done'), 20)
//         }
//     })
// }

export function loadMasterField({ commit }, { item, id, rowId, load }) {
    let fieldValues = R.values(R.mapObjIndexed(shapeData, item))
    R.map(x => commit('MDSetFieldRow', { ...x, masterId: id, rowId }), fieldValues)
    if (load) commit('setLoadingFalse')
}

export function showDetailFieldsList ({ commit, state }, { id, listId, select, masterLookupName }) {
    let { itemId } = state
    return getItemDetail(listId, masterLookupName, itemId, select)
        .map(x => JSON.parse(x))
        .fork(
            err     => commit('addError', err),
            items   => {
                items.forEach((item, k) => {
                    let load = k == items.length - 1
                    let rowId = MDAddRow({ commit }, { id })
                    loadMasterField({ commit }, { item, id, rowId, load })
                })
                commit('setLoadingFalse')
            }
        )
}

export function loadUpload({ commit }, { id, listId }) {
    return getItems(listId)
        .fork(
            err     => commit('addError', err),
            options => commit('loadOptions', { id, options })
        )
}

export function addError({ commit }, err) {
    commit('addError', err)
}

export function addToAddFiles({ commit }, payload ){
    commit('addToAddFiles', payload)
}

export function removeFromAddFiles({ commit }, id ){
    commit('removeFromAddFiles', id)
}

export function addToDeleteFiles({ commit }, payload){
    commit('addToDeleteFiles', payload)
}
