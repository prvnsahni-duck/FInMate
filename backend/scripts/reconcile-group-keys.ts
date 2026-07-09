#!/usr/bin/env node
/* Reconciliation script: backfill missing MemberWrappedGroupKey rows where possible.
 * Usage: node dist/scripts/reconcile-group-keys.js
 * This script should be run with NODE_ENV and DB configured.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MemberWrappedGroupKey, Group, GroupMember, GroupInvite, GroupKeyVersion } from '@finmate/data-models';
import { In } from 'typeorm';

async function main() {
  console.log('Starting group keys reconciliation');
  // Use existing orm config via DataSource in app; for simplicity create a DataSource from ormconfig
  const ds = new DataSource(require('../ormconfig').default);
  await ds.initialize();

  const groups = await ds.getRepository(Group).find();
  const report: any[] = [];

  for (const g of groups) {
    const activeVersion = await ds.getRepository(GroupKeyVersion).findOne({ where: { group: { id: g.id }, status: 'ACTIVE' } });
    if (!activeVersion) continue;

    const members = await ds.getRepository(GroupMember).find({ where: { group: { id: g.id }, joinStatus: In(['active','invited']) }, relations: ['user'] });

    for (const m of members) {
      const existing = await ds.getRepository(MemberWrappedGroupKey).findOne({ where: { groupKeyVersion: { id: activeVersion.id }, user: { id: m.user.id } } });
      if (!existing) {
        // Try to find from group_invites
        const invite = await ds.getRepository(GroupInvite).findOne({ where: { inviteeUser: { id: m.user.id }, group: { id: g.id }, groupKeyVersion: { id: activeVersion.id } } });
        if (invite && invite.wrappedGroupKey) {
          await ds.getRepository(MemberWrappedGroupKey).save(ds.getRepository(MemberWrappedGroupKey).create({ group: g, groupKeyVersion: activeVersion, user: m.user, wrappedGroupKey: invite.wrappedGroupKey }));
          report.push({ groupId: g.id, userId: m.user.id, action: 'backfilled_from_invite' });
          continue;
        }

        report.push({ groupId: g.id, userId: m.user.id, action: 'missing' });
      }
    }
  }

  console.log('Reconciliation report:', report);
  await ds.destroy();
}

main().catch((e) => {
  console.error('Reconciliation failed', e);
  process.exit(1);
});
