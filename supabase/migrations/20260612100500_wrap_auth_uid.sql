-- Wrap bare auth.uid() in (SELECT auth.uid()) across all public policies
-- so Postgres evaluates it once per statement instead of once per row.
-- Generated from pg_policy (June 2026 review phase 2).

ALTER POLICY "Authenticated friends can view availability" ON public.availability USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM friendships
  WHERE ((friendships.user_id = (SELECT auth.uid())) AND (friendships.friend_user_id = availability.user_id) AND (friendships.status = 'connected'::text))))));
ALTER POLICY "Users can create their own availability" ON public.availability WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own availability" ON public.availability USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own availability" ON public.availability USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own availability" ON public.availability USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own calendar connections" ON public.calendar_connections USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can insert their own calendar connections" ON public.calendar_connections WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own calendar connections" ON public.calendar_connections USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own calendar connections" ON public.calendar_connections USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own messages" ON public.chat_messages USING (((SELECT auth.uid()) = sender_id));
ALTER POLICY "Users can send messages to their conversations" ON public.chat_messages WITH CHECK ((((SELECT auth.uid()) = sender_id) AND (conversation_id IN ( SELECT user_conversation_ids((SELECT auth.uid())) AS user_conversation_ids))));
ALTER POLICY "Users can update their own messages" ON public.chat_messages USING (((SELECT auth.uid()) = sender_id)) WITH CHECK (((SELECT auth.uid()) = sender_id));
ALTER POLICY "Users can view messages in their conversations" ON public.chat_messages USING ((conversation_id IN ( SELECT user_conversation_ids((SELECT auth.uid())) AS user_conversation_ids)));
ALTER POLICY "Conversation creators can add participants" ON public.conversation_participants WITH CHECK (((EXISTS ( SELECT 1
   FROM conversations
  WHERE ((conversations.id = conversation_participants.conversation_id) AND (conversations.created_by = (SELECT auth.uid()))))) OR ((SELECT auth.uid()) = user_id)));
ALTER POLICY "Users can update their own participation" ON public.conversation_participants USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view participants of their conversations" ON public.conversation_participants USING ((conversation_id IN ( SELECT user_conversation_ids((SELECT auth.uid())) AS user_conversation_ids)));
ALTER POLICY "Users can create conversations" ON public.conversations WITH CHECK (((SELECT auth.uid()) = created_by));
ALTER POLICY "Users can update their conversations" ON public.conversations USING ((id IN ( SELECT user_conversation_ids((SELECT auth.uid())) AS user_conversation_ids)));
ALTER POLICY "Users can view their conversations" ON public.conversations USING (((created_by = (SELECT auth.uid())) OR (id IN ( SELECT user_conversation_ids((SELECT auth.uid())) AS user_conversation_ids))));
ALTER POLICY "Users can insert their own feedback" ON public.feedback WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own feedback" ON public.feedback USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view incoming friend requests" ON public.friendships USING (((SELECT auth.uid()) = friend_user_id));
ALTER POLICY "Senders can view their sent hang requests" ON public.hang_requests USING (((SELECT auth.uid()) = sender_id));
ALTER POLICY "Users can create their own hang requests" ON public.hang_requests WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own hang requests" ON public.hang_requests USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own hang requests" ON public.hang_requests USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own hang requests" ON public.hang_requests USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can read their own cache rows" ON public.last_hung_out_cache USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can add reactions" ON public.message_reactions WITH CHECK ((((SELECT auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM chat_messages cm
  WHERE ((cm.id = message_reactions.message_id) AND (cm.conversation_id IN ( SELECT user_conversation_ids((SELECT auth.uid())) AS user_conversation_ids)))))));
ALTER POLICY "Users can remove their own reactions" ON public.message_reactions USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view reactions in their conversations" ON public.message_reactions USING ((EXISTS ( SELECT 1
   FROM chat_messages cm
  WHERE ((cm.id = message_reactions.message_id) AND (cm.conversation_id IN ( SELECT user_conversation_ids((SELECT auth.uid())) AS user_conversation_ids))))));
ALTER POLICY "Invite owners can view all responses" ON public.open_invite_responses USING ((EXISTS ( SELECT 1
   FROM open_invites
  WHERE ((open_invites.id = open_invite_responses.open_invite_id) AND (open_invites.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can create their own response" ON public.open_invite_responses WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own response" ON public.open_invite_responses USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own response" ON public.open_invite_responses USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own response" ON public.open_invite_responses USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Recipients can view open invites targeted at them" ON public.open_invites USING (((status = 'open'::text) AND (expires_at > now()) AND (((audience_type = 'all_friends'::text) AND (EXISTS ( SELECT 1
   FROM friendships
  WHERE ((friendships.user_id = open_invites.user_id) AND (friendships.friend_user_id = (SELECT auth.uid())) AND (friendships.status = 'connected'::text))))) OR ((audience_type = 'pod'::text) AND (EXISTS ( SELECT 1
   FROM (pod_members pm
     JOIN pods p ON ((p.id = pm.pod_id)))
  WHERE ((p.user_id = open_invites.user_id) AND (('pod:'::text || (pm.pod_id)::text) = ('pod:'::text || open_invites.audience_ref)) AND (pm.friend_user_id = (SELECT auth.uid())))))) OR ((audience_type = 'interest'::text) AND (EXISTS ( SELECT 1
   FROM (friendships f
     JOIN profiles pr ON ((pr.user_id = (SELECT auth.uid()))))
  WHERE ((f.user_id = open_invites.user_id) AND (f.friend_user_id = (SELECT auth.uid())) AND (f.status = 'connected'::text) AND (open_invites.audience_ref = ANY (pr.interests)))))) OR ((audience_type = 'friends'::text) AND (audience_ref IS NOT NULL) AND (((SELECT auth.uid()))::text = ANY (string_to_array(audience_ref, ','::text))) AND (EXISTS ( SELECT 1
   FROM friendships
  WHERE ((friendships.user_id = open_invites.user_id) AND (friendships.friend_user_id = (SELECT auth.uid())) AND (friendships.status = 'connected'::text))))))));
ALTER POLICY "Users can create their own open invites" ON public.open_invites WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own open invites" ON public.open_invites USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own open invites" ON public.open_invites USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own open invites" ON public.open_invites USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Plan members can create change requests" ON public.plan_change_requests WITH CHECK ((((SELECT auth.uid()) = proposed_by) AND ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_change_requests.plan_id) AND (plans.user_id = (SELECT auth.uid()))))) OR (plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)))));
ALTER POLICY "Plan owners can delete change requests" ON public.plan_change_requests USING (((SELECT auth.uid()) = proposed_by));
ALTER POLICY "Plan owners can update change requests" ON public.plan_change_requests USING (((SELECT auth.uid()) = proposed_by));
ALTER POLICY "Users can view change requests for their plans" ON public.plan_change_requests USING (((plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)) OR (EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_change_requests.plan_id) AND (plans.user_id = (SELECT auth.uid())))))));
ALTER POLICY "Plan members can create change responses" ON public.plan_change_responses WITH CHECK ((EXISTS ( SELECT 1
   FROM plan_change_requests cr
  WHERE ((cr.id = plan_change_responses.change_request_id) AND ((cr.proposed_by = (SELECT auth.uid())) OR (cr.plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)) OR (EXISTS ( SELECT 1
           FROM plans
          WHERE ((plans.id = cr.plan_id) AND (plans.user_id = (SELECT auth.uid()))))))))));
ALTER POLICY "Plan members can respond to change requests" ON public.plan_change_responses USING (((SELECT auth.uid()) = participant_id)) WITH CHECK (((SELECT auth.uid()) = participant_id));
ALTER POLICY "Users can view change responses" ON public.plan_change_responses USING ((EXISTS ( SELECT 1
   FROM plan_change_requests cr
  WHERE ((cr.id = plan_change_responses.change_request_id) AND ((cr.proposed_by = (SELECT auth.uid())) OR (cr.plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)))))));
ALTER POLICY "Users can add comments on accessible plans" ON public.plan_comments WITH CHECK ((((SELECT auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM plans p
  WHERE ((p.id = plan_comments.plan_id) AND ((p.user_id = (SELECT auth.uid())) OR (plan_comments.plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)) OR ((p.feed_visibility <> 'private'::text) AND (EXISTS ( SELECT 1
           FROM friendships f
          WHERE ((f.user_id = (SELECT auth.uid())) AND (f.friend_user_id = p.user_id) AND (f.status = 'connected'::text)))))))))));
ALTER POLICY "Users can delete their own comments" ON public.plan_comments USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view comments on accessible plans" ON public.plan_comments USING ((EXISTS ( SELECT 1
   FROM plans p
  WHERE ((p.id = plan_comments.plan_id) AND ((p.user_id = (SELECT auth.uid())) OR (plan_comments.plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)) OR ((p.feed_visibility <> 'private'::text) AND (EXISTS ( SELECT 1
           FROM friendships f
          WHERE ((f.user_id = (SELECT auth.uid())) AND (f.friend_user_id = p.user_id) AND (f.status = 'connected'::text))))))))));
ALTER POLICY "Inviters can view their own invites" ON public.plan_invites USING (((SELECT auth.uid()) = invited_by));
ALTER POLICY "Plan owners can manage invites" ON public.plan_invites USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_invites.plan_id) AND (plans.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_invites.plan_id) AND (plans.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Plan participants can create invites" ON public.plan_invites WITH CHECK ((((SELECT auth.uid()) = invited_by) AND ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_invites.plan_id) AND (plans.user_id = (SELECT auth.uid()))))) OR (plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)))));
ALTER POLICY "Organizers can update participant requests" ON public.plan_participant_requests USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participant_requests.plan_id) AND (plans.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Organizers can view participant requests" ON public.plan_participant_requests USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participant_requests.plan_id) AND (plans.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Plan members can request to add friends" ON public.plan_participant_requests WITH CHECK ((((SELECT auth.uid()) = requested_by) AND ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participant_requests.plan_id) AND (plans.user_id = (SELECT auth.uid()))))) OR (plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)))));
ALTER POLICY "Requesters can delete pending requests" ON public.plan_participant_requests USING ((((SELECT auth.uid()) = requested_by) AND (status = 'pending'::text)));
ALTER POLICY "Requesters can view their own requests" ON public.plan_participant_requests USING (((SELECT auth.uid()) = requested_by));
ALTER POLICY "Participants can remove themselves from plans" ON public.plan_participants USING (((SELECT auth.uid()) = friend_id));
ALTER POLICY "Participants can update their own status" ON public.plan_participants USING (((SELECT auth.uid()) = friend_id)) WITH CHECK (((SELECT auth.uid()) = friend_id));
ALTER POLICY "Participants can view co-participants" ON public.plan_participants USING ((plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)));
ALTER POLICY "Users can add participants to their plans" ON public.plan_participants WITH CHECK ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participants.plan_id) AND (plans.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can remove participants from their plans" ON public.plan_participants USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participants.plan_id) AND (plans.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can view participants of their plans" ON public.plan_participants USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_participants.plan_id) AND (plans.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can view plans they participate in" ON public.plan_participants USING (((SELECT auth.uid()) = friend_id));
ALTER POLICY "Plan owners can manage photos" ON public.plan_photos USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_photos.plan_id) AND (plans.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Plan participants can insert photos" ON public.plan_photos WITH CHECK ((((SELECT auth.uid()) = uploaded_by) AND ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_photos.plan_id) AND (plans.user_id = (SELECT auth.uid()))))) OR (plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)))));
ALTER POLICY "Plan participants can view photos" ON public.plan_photos USING ((plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)));
ALTER POLICY "Users can delete their own photos" ON public.plan_photos USING (((SELECT auth.uid()) = uploaded_by));
ALTER POLICY "Participants can view proposal options" ON public.plan_proposal_options USING ((plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)));
ALTER POLICY "Plan owners can manage proposal options" ON public.plan_proposal_options USING ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_proposal_options.plan_id) AND (plans.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM plans
  WHERE ((plans.id = plan_proposal_options.plan_id) AND (plans.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Plan members can view votes" ON public.plan_proposal_votes USING ((EXISTS ( SELECT 1
   FROM (plan_proposal_options ppo
     JOIN plans p ON ((p.id = ppo.plan_id)))
  WHERE ((ppo.id = plan_proposal_votes.option_id) AND ((p.user_id = (SELECT auth.uid())) OR (ppo.plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)))))));
ALTER POLICY "Users can delete their votes" ON public.plan_proposal_votes USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can submit their votes" ON public.plan_proposal_votes WITH CHECK ((((SELECT auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM (plan_proposal_options ppo
     JOIN plans p ON ((p.id = ppo.plan_id)))
  WHERE ((ppo.id = plan_proposal_votes.option_id) AND ((p.user_id = (SELECT auth.uid())) OR (ppo.plan_id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids))))))));
ALTER POLICY "Users can update their votes" ON public.plan_proposal_votes USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own reminders" ON public.plan_reminders_sent USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Participants can update non-time plan fields" ON public.plans USING ((id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids))) WITH CHECK ((id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)));
ALTER POLICY "Users can create their own plans" ON public.plans WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own plans" ON public.plans USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own plans" ON public.plans USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view plans they are invited to" ON public.plans USING ((id IN ( SELECT user_participated_plan_ids((SELECT auth.uid())) AS user_participated_plan_ids)));
ALTER POLICY "Users can view their own plans" ON public.plans USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can add members to their pods" ON public.pod_members WITH CHECK ((EXISTS ( SELECT 1
   FROM pods
  WHERE ((pods.id = pod_members.pod_id) AND (pods.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can remove members from their pods" ON public.pod_members USING ((EXISTS ( SELECT 1
   FROM pods
  WHERE ((pods.id = pod_members.pod_id) AND (pods.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can view members of their pods" ON public.pod_members USING ((EXISTS ( SELECT 1
   FROM pods
  WHERE ((pods.id = pod_members.pod_id) AND (pods.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can create their own pods" ON public.pods WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own pods" ON public.pods USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own pods" ON public.pods USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own pods" ON public.pods USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Authenticated users can view friend profiles" ON public.profiles USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM friendships
  WHERE ((friendships.user_id = (SELECT auth.uid())) AND (friendships.friend_user_id = profiles.user_id) AND (friendships.status = 'connected'::text))))));
ALTER POLICY "Users can delete their own profile" ON public.profiles USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can manage own push subscriptions" ON public.push_subscriptions USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users delete own push_tokens" ON public.push_tokens USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users insert own push_tokens" ON public.push_tokens WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users select own push_tokens" ON public.push_tokens USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users update own push_tokens" ON public.push_tokens USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users delete own reactions" ON public.reactions USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can create their own recurring plans" ON public.recurring_plans WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own recurring plans" ON public.recurring_plans USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own recurring plans" ON public.recurring_plans USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own recurring plans" ON public.recurring_plans USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own nudges" ON public.smart_nudges USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own nudges" ON public.smart_nudges USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own nudges" ON public.smart_nudges USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Participants can add activity suggestions" ON public.trip_activity_suggestions WITH CHECK ((((SELECT auth.uid()) = suggested_by) AND is_trip_proposal_participant(proposal_id)));
ALTER POLICY "Suggesters can delete own suggestions" ON public.trip_activity_suggestions USING (((SELECT auth.uid()) = suggested_by));
ALTER POLICY "Suggesters can update own suggestions" ON public.trip_activity_suggestions USING (((SELECT auth.uid()) = suggested_by)) WITH CHECK (((SELECT auth.uid()) = suggested_by));
ALTER POLICY "Participants can submit activity votes" ON public.trip_activity_votes WITH CHECK ((((SELECT auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM trip_activity_suggestions s
  WHERE ((s.id = trip_activity_votes.suggestion_id) AND is_trip_proposal_participant(s.proposal_id))))));
ALTER POLICY "Users can delete own activity votes" ON public.trip_activity_votes USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update own activity votes" ON public.trip_activity_votes USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Connected friends can view trip participants" ON public.trip_participants USING ((EXISTS ( SELECT 1
   FROM (trips t
     JOIN friendships f ON (((f.user_id = (SELECT auth.uid())) AND (f.friend_user_id = t.user_id) AND (f.status = 'connected'::text))))
  WHERE (t.id = trip_participants.trip_id))));
ALTER POLICY "Participants can view their own participation" ON public.trip_participants USING (((SELECT auth.uid()) = friend_user_id));
ALTER POLICY "Trip owners can manage participants" ON public.trip_participants USING ((EXISTS ( SELECT 1
   FROM trips
  WHERE ((trips.id = trip_participants.trip_id) AND (trips.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM trips
  WHERE ((trips.id = trip_participants.trip_id) AND (trips.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Creator can manage proposal dates" ON public.trip_proposal_dates USING ((EXISTS ( SELECT 1
   FROM trip_proposals tp
  WHERE ((tp.id = trip_proposal_dates.proposal_id) AND (tp.created_by = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM trip_proposals tp
  WHERE ((tp.id = trip_proposal_dates.proposal_id) AND (tp.created_by = (SELECT auth.uid()))))));
ALTER POLICY "Participants can view proposal dates" ON public.trip_proposal_dates USING ((EXISTS ( SELECT 1
   FROM trip_proposal_participants tpp
  WHERE ((tpp.proposal_id = trip_proposal_dates.proposal_id) AND (tpp.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can create invites for proposals they participate in" ON public.trip_proposal_invites WITH CHECK (((invited_by = (SELECT auth.uid())) AND is_trip_proposal_participant(proposal_id)));
ALTER POLICY "Users can view invites they created" ON public.trip_proposal_invites USING ((invited_by = (SELECT auth.uid())));
ALTER POLICY "Creator can manage participants" ON public.trip_proposal_participants USING ((EXISTS ( SELECT 1
   FROM trip_proposals tp
  WHERE ((tp.id = trip_proposal_participants.proposal_id) AND (tp.created_by = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM trip_proposals tp
  WHERE ((tp.id = trip_proposal_participants.proposal_id) AND (tp.created_by = (SELECT auth.uid()))))));
ALTER POLICY "Participants can update their own record" ON public.trip_proposal_participants USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Participants can view trip votes" ON public.trip_proposal_votes USING ((EXISTS ( SELECT 1
   FROM (trip_proposal_dates tpd
     JOIN trip_proposal_participants tpp ON ((tpp.proposal_id = tpd.proposal_id)))
  WHERE ((tpd.id = trip_proposal_votes.date_id) AND (tpp.user_id = (SELECT auth.uid()))))));
ALTER POLICY "Users can delete their trip votes" ON public.trip_proposal_votes USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can submit trip votes" ON public.trip_proposal_votes WITH CHECK ((((SELECT auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM (trip_proposal_dates tpd
     JOIN trip_proposal_participants tpp ON ((tpp.proposal_id = tpd.proposal_id)))
  WHERE ((tpd.id = trip_proposal_votes.date_id) AND (tpp.user_id = (SELECT auth.uid())))))));
ALTER POLICY "Users can update their trip votes" ON public.trip_proposal_votes USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can create their own trip proposals" ON public.trip_proposals WITH CHECK (((SELECT auth.uid()) = created_by));
ALTER POLICY "Users can delete their own trip proposals" ON public.trip_proposals USING (((SELECT auth.uid()) = created_by));
ALTER POLICY "Users can update their own trip proposals" ON public.trip_proposals USING (((SELECT auth.uid()) = created_by));
ALTER POLICY "Users can view their own trip proposals" ON public.trip_proposals USING (((SELECT auth.uid()) = created_by));
ALTER POLICY "Connected friends can view trips" ON public.trips USING ((EXISTS ( SELECT 1
   FROM friendships
  WHERE ((friendships.user_id = (SELECT auth.uid())) AND (friendships.friend_user_id = trips.user_id) AND (friendships.status = 'connected'::text)))));
ALTER POLICY "Priority friends can view trips" ON public.trips USING ((((SELECT auth.uid()) = ANY (priority_friend_ids)) AND (EXISTS ( SELECT 1
   FROM friendships
  WHERE ((friendships.user_id = (SELECT auth.uid())) AND (friendships.friend_user_id = trips.user_id) AND (friendships.status = 'connected'::text))))));
ALTER POLICY "Users can create their own trips" ON public.trips WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own trips" ON public.trips USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own trips" ON public.trips USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own trips" ON public.trips USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Recipients can add comments" ON public.vibe_comments WITH CHECK ((((SELECT auth.uid()) = user_id) AND check_vibe_recipient(vibe_send_id)));
ALTER POLICY "Senders can add comments on their vibes" ON public.vibe_comments WITH CHECK ((((SELECT auth.uid()) = user_id) AND check_vibe_sender(vibe_send_id)));
ALTER POLICY "Users can delete their own comments" ON public.vibe_comments USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Recipients can add vibe reactions" ON public.vibe_reactions WITH CHECK ((((SELECT auth.uid()) = user_id) AND check_vibe_recipient(vibe_send_id)));
ALTER POLICY "Users can remove their own vibe reactions" ON public.vibe_reactions USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Recipients can update their own read status" ON public.vibe_send_recipients USING (((SELECT auth.uid()) = recipient_id)) WITH CHECK (((SELECT auth.uid()) = recipient_id));
ALTER POLICY "Recipients can view their own entries" ON public.vibe_send_recipients USING (((SELECT auth.uid()) = recipient_id));
ALTER POLICY "Users can create their own vibes" ON public.vibe_sends WITH CHECK (((SELECT auth.uid()) = sender_id));
ALTER POLICY "Users can delete their own vibes" ON public.vibe_sends USING (((SELECT auth.uid()) = sender_id));
ALTER POLICY "Users can view vibes they sent" ON public.vibe_sends USING (((SELECT auth.uid()) = sender_id));
ALTER POLICY "Users can create their own intentions" ON public.weekly_intentions WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can delete their own intentions" ON public.weekly_intentions USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can update their own intentions" ON public.weekly_intentions USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can view their own intentions" ON public.weekly_intentions USING (((SELECT auth.uid()) = user_id));
