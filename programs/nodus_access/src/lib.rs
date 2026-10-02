use anchor_lang::prelude::*;

// Synchronize this value with the deploy keypair by running `anchor keys sync`.
// The program intentionally stores no asset names, tags, plaintext or key material.
declare_id!("NodUS11111111111111111111111111111111111111");

#[program]
pub mod nodus_access {
    use super::*;

    pub fn initialize_organization(ctx: Context<InitializeOrganization>, organization_hash: [u8; 32]) -> Result<()> {
        let organization = &mut ctx.accounts.organization;
        organization.authority = ctx.accounts.authority.key();
        organization.organization_hash = organization_hash;
        organization.bump = ctx.bumps.organization;
        organization.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn upsert_member(ctx: Context<UpsertMember>, role: Role) -> Result<()> {
        let member = &mut ctx.accounts.member;
        member.organization = ctx.accounts.organization.key();
        member.wallet = ctx.accounts.wallet.key();
        member.role = role;
        member.active = true;
        member.bump = ctx.bumps.member;
        member.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn set_capability(ctx: Context<SetCapability>, capability_hash: [u8; 32]) -> Result<()> {
        require!(ctx.accounts.member.active, AccessError::InactiveMember);
        let capability = &mut ctx.accounts.capability;
        capability.member = ctx.accounts.member.key();
        capability.capability_hash = capability_hash;
        capability.role = ctx.accounts.member.role;
        capability.active = true;
        capability.bump = ctx.bumps.capability;
        capability.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn revoke_member(ctx: Context<RevokeMember>) -> Result<()> {
        require!(ctx.accounts.member.wallet != ctx.accounts.organization.authority, AccessError::CannotRevokeOwner);
        ctx.accounts.member.active = false;
        ctx.accounts.member.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn revoke_capability(ctx: Context<RevokeCapability>) -> Result<()> {
        ctx.accounts.capability.active = false;
        ctx.accounts.capability.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(organization_hash: [u8; 32])]
pub struct InitializeOrganization<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Organization::INIT_SPACE, seeds = [b"nodus_org", organization_hash.as_ref()], bump)]
    pub organization: Account<'info, Organization>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpsertMember<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    #[account(has_one = authority)] pub organization: Account<'info, Organization>,
    /// CHECK: Identity public key; it does not sign assignment.
    pub wallet: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = authority, space = 8 + Member::INIT_SPACE, seeds = [b"nodus_member", organization.key().as_ref(), wallet.key().as_ref()], bump)]
    pub member: Account<'info, Member>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(capability_hash: [u8; 32])]
pub struct SetCapability<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    #[account(has_one = authority)] pub organization: Account<'info, Organization>,
    #[account(has_one = organization)] pub member: Account<'info, Member>,
    #[account(init_if_needed, payer = authority, space = 8 + Capability::INIT_SPACE, seeds = [b"nodus_capability", member.key().as_ref(), capability_hash.as_ref()], bump)]
    pub capability: Account<'info, Capability>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeMember<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = authority)] pub organization: Account<'info, Organization>,
    #[account(mut, has_one = organization)] pub member: Account<'info, Member>,
}

#[derive(Accounts)]
pub struct RevokeCapability<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = authority)] pub organization: Account<'info, Organization>,
    #[account(has_one = organization)] pub member: Account<'info, Member>,
    #[account(mut, has_one = member)] pub capability: Account<'info, Capability>,
}

#[account]
#[derive(InitSpace)]
pub struct Organization { pub authority: Pubkey, pub organization_hash: [u8; 32], pub bump: u8, pub created_at: i64 }
#[account]
#[derive(InitSpace)]
pub struct Member { pub organization: Pubkey, pub wallet: Pubkey, pub role: Role, pub active: bool, pub bump: u8, pub updated_at: i64 }
#[account]
#[derive(InitSpace)]
pub struct Capability { pub member: Pubkey, pub capability_hash: [u8; 32], pub role: Role, pub active: bool, pub bump: u8, pub updated_at: i64 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum Role { Viewer, Contributor, Admin, Owner }

#[error_code]
pub enum AccessError {
    #[msg("A capability cannot be issued to an inactive member")] InactiveMember,
    #[msg("The organization authority cannot be revoked through this instruction")] CannotRevokeOwner,
}
