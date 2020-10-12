import React, { useContext, useEffect } from "react";
import { Grid } from "semantic-ui-react";
import { RootStoreContext } from "../../app/stores/rootStore";
import { ProfileContent } from "./ProfileContent";
import ProfileHeader from "./ProfileHeader";
import { RouteComponentProps } from "react-router-dom";
import { LoadingComponent } from "../../app/layout/LoadingComponent";
import { observer } from "mobx-react-lite";

interface RouteParams {
  username: string;
}

const ProfilePage: React.FC<RouteComponentProps<RouteParams>> = ({ match }) => {
  const rootStore = useContext(RootStoreContext);
  const { loadingProfile, profile, loadProfile } = rootStore.profileStore;

  useEffect(() => {
    loadProfile(match.params.username);
  }, [loadProfile, match]);

  if (loadingProfile) return <LoadingComponent content="Loading profile..." />;

  return (
    <Grid>
      <Grid.Column width={16}>
        <ProfileHeader profile={profile}/>
        <ProfileContent />
      </Grid.Column>
    </Grid>
  );
};

export default observer(ProfilePage);