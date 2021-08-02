/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema, Slugify, currentRoleNames, toHash } from '../../utils'
import { getUserByRole } from '../Queries/Users'
import { deleteUserProfile } from './Users'
import { groupByRole } from '../Queries/Features'
import { searchRoles } from '../Queries/Roles'

const config: any = currentSchema('b2b_roles')

export const saveRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
  } = ctx

  try {
    const { id, name, features } = params
    const slug = params.slug ?? Slugify(name)
    const locked = params.locked ?? false
    const ret: any = await masterdata
      .createOrUpdateEntireDocument({
        dataEntity: config.name,
        fields: { name, features, locked, slug },
        id,
        schema: config.version,
      })
      .then((r: any) => {
        return r
      })
      .catch((err: any) => {
        if (err.response.status < 400) {
          return {
            DocumentId: id,
          }
        }

        throw err
      })

    if (ret.DocumentId) {
      await vbase.saveJSON('b2b_roles', ret.DocumentId, {
        id: ret.DocumentId,
        name,
        locked,
        slug,
        features,
      })
    }

    return { status: 'success', message: '', id: ret.DocumentId }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const syncRoles = async (ctx: Context) => {
  const newRoles: any = []
  // Get role names based on the location
  const roleNames = currentRoleNames(ctx.vtex.tenant?.locale)
  // List all features grouped by Role
  const groups = await groupByRole(ctx)

  // List all roles from MD
  const roles: any = await searchRoles(null, null, ctx)

  // Compare existing roles (MD) to save only differences

  groups?.forEach((role: any) => {
    const [slug] = Object.getOwnPropertyNames(role)
    let currRole: any = {}
    const roleIndex = roles.findIndex((o: any) => o.slug === slug)

    if (roleIndex === -1) {
      currRole = {
        name: roleNames[slug],
        features: role[slug],
        slug,
        locked: true,
      }
    } else if (toHash(role[slug]) !== toHash(roles[roleIndex].features)) {
      // Compare features
      const newFeatures: any = roles[roleIndex].features
      const newModules = role[slug].filter((m: any) => {
        return (
          roles[roleIndex].features.findIndex(
            (i: any) => i.module === m.module
          ) === -1
        )
      })

      newModules.forEach((m: any) => {
        newFeatures.push(m)
      })

      currRole = {
        ...roles[roleIndex],
        features: newFeatures,
      }
    }

    if (currRole.name) {
      newRoles.push(currRole)
    }
  })

  const oldRoles = roles.filter((old: any) => {
    return newRoles.findIndex((n: any) => n.slug === old.slug) === -1
  })

  const mergedRoles = oldRoles.concat(newRoles)

  const promise: any = []

  mergedRoles.forEach((role: any) => {
    promise.push(saveRole(null, role, ctx))
  })

  return Promise.all(promise).then(() => mergedRoles)
}

export const deleteRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const checkUsers: any = await getUserByRole(_, { id: params.id }, ctx)

    if (checkUsers.length) {
      const ids = checkUsers.map((item: any) => {
        return item.id
      })

      await deleteUserProfile(_, { ids }, ctx)
    }

    await masterdata.deleteDocument({ dataEntity: config.name, id: params.id })

    return { status: 'success', message: '', id: params.id }
  } catch (e) {
    return { status: 'error', message: e }
  }
}